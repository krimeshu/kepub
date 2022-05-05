import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream';
import { createReadStream, createWriteStream } from 'fs';

import AdmZip from 'adm-zip';
import mkdirp from 'mkdirp';
import mimeTypes from 'mime-types';
import asyncPool from 'tiny-async-pool';
import rimraf from 'rimraf';

import {
    render,
    renderMdPage,
} from './render.js';

const isDebug = false;

const tempDir = isDebug ? './.temp'
    : path.join(os.tmpdir(), 'kepub');

const RENDER_CONCUR_RESTRICTION = 10;
const COPY_CONCUR_RESTRICTION = 5;

const flattenPages = (pages) => {
    const list = [];
    const toc = [];
    pages.forEach((originPage) => {
        const page = { ...originPage };
        const { children } = page;
        list.push(page);
        const tocItem = { page };
        toc.push(tocItem);

        if (children && Array.isArray(children)) {
            delete page.children;
            const { list: subList, toc: subToc } = flattenPages(children);
            tocItem.children = subToc;
            list.push(...subList);
        }
    });
    return {
        list,
        toc,
    };
};

const parseToc = (toc) => {
    if (!Array.isArray(toc) || toc.length < 1) return '';
    const buffer = [];
    buffer.push('<ol>');
    toc.forEach((item) => {
        const { page, children } = item;
        const { href, title, hidden } = page;
        buffer.push(`<li${hidden ? ' hidden=""' : ''}><a href="${href}">${title}</a>`);
        if (children) {
            buffer.push(parseToc(children));
        }
        buffer.push('</li>');
    });
    buffer.push('</ol>');
    return buffer.join('\n');
};

const isAbsolute = (src) => /^([^:\\/]+:\/)?\//.test(src);
export default class Task {
    constructor(targetDir, config) {
        this.targetDir = targetDir;
        this.config = config;
        this.state = 'idle';

        const stamp = Date.now();
        const taskName = `task_${stamp}_${Math.random()}`;
        const taskDir = path.join(tempDir, taskName);

        this.name = taskName;
        this.saveDir = taskDir;

        this.rendering = [];
        this.pageToc = [];
        this.pageList = [];
    }

    getTempName() {
        const usedName = this.$usedTempName || [];
        this.$usedTempName = usedName;

        const name = [Date.now(), Math.random()]
            .map((n) => n.toString(16))
            .join('_').replace(/\./g, '');
        if (usedName.includes(name)) return this.getTempName();
        usedName.push(name);
        return name;
    }

    // async readFile(subPath) {
    //     const { targetDir } = this;
    //     const filePath = path.join(targetDir, subPath);
    //     return fs.readFile(filePath);
    // }

    async writeFile(subPath, content) {
        const { saveDir } = this;
        const filePath = path.join(saveDir, subPath);
        const dirPath = path.dirname(filePath);
        await mkdirp(dirPath);
        return fs.writeFile(filePath, content);
    }

    async copyImage(src) {
        if (/^https?:\/\//.test(src)) return src;

        const { targetDir, saveDir } = this;

        const isAbs = isAbsolute(src);
        const href = !isAbs ? src
            : this.getTempName().concat(path.extname(src));

        const srcPath = isAbs ? src : path.join(targetDir, src);
        const savePath = path.join(saveDir, `EPUB/${href}`);

        // console.log(`[copy-image] from: ${srcPath}\n  to: ${savePath}`);
        const dirPath = path.dirname(savePath);
        await mkdirp(dirPath);

        return new Promise((rs, rj) => {
            pipeline(
                createReadStream(srcPath),
                createWriteStream(savePath),
                (err) => {
                    if (err) rj(err);
                    rs(href);
                },
            );
        });
    }

    async convertPages(pageList) {
        const { targetDir } = this;
        const imageList = [];

        // 处理单个页面
        const convertPage = async (page) => {
            const {
                title: titleOrNot,
                file,
                href,
            } = page;

            const filePath = path.join(targetDir, file);
            const {
                title,
                content,
                images,
            } = await renderMdPage(filePath, {
                title: titleOrNot,
            });

            if (titleOrNot !== title) {
                const refPage = page;
                refPage.title = title;
            }

            const pageDir = path.dirname(filePath);
            images.forEach((src) => {
                let fixedSrc = src;
                if (!isAbsolute(src)) {
                    // 处理页面相对路径
                    const absSrc = path.join(pageDir, src);
                    fixedSrc = path.relative(targetDir, absSrc);
                }
                if (!imageList.includes(fixedSrc)) {
                    imageList.push(fixedSrc);
                }
            });

            const savePath = `EPUB/${href}`;
            return this.writeFile(savePath, content);
        };

        // 并发处理页面
        await asyncPool(RENDER_CONCUR_RESTRICTION, pageList, convertPage);

        return {
            imageList,
        };
    }

    async transportImages(imageList) {
        const imageHrefList = [];
        const copyImage = async (image) => {
            const href = await this.copyImage(image);
            imageHrefList.push({
                href,
            });
        };
        // 并发复制图片
        await asyncPool(COPY_CONCUR_RESTRICTION, imageList, copyImage);

        return {
            imageHrefList,
        };
    }

    async run() {
        if (this.state !== 'idle') {
            throw new Error(`TaskError: current task state is not "idle", but ${JSON.stringify(this.state)}`);
        }
        this.state = 'running';

        // 处理任务参数
        const {
            meta,
            pages,
            cover,
            options,
        } = this.config;
        const {
            tocTitle = 'Table of Contents',
        } = options || {};
        const {
            list: pageList,
            toc: pageTree,
        } = flattenPages(pages);

        // 处理页面参数
        pageList.forEach((page) => {
            const refPage = page;
            const basePath = page.file.replace(/\.md$/i, '');
            const href = `${basePath}.xhtml`;
            refPage.href = href;
        });

        // 转换页面
        const {
            imageList,
        } = await this.convertPages(pageList);

        // 处理图片
        const {
            imageHrefList,
        } = await this.transportImages(imageList);

        const manifestList = [
            // 页面加入资源列表
            ...pageList.map(({ href }, index) => ({
                id: `page-${index}`,
                href,
            })),
            // 引用图片加入资源列表
            ...imageHrefList.map(({ href }, index) => ({
                id: `image-${index}`,
                href,
            })),
        ];

        // 生成目录
        await this.writeFile('EPUB/toc.xhtml', await render('EPUB/toc.xhtml', {
            tocTitle,
            tocHtml: parseToc(pageTree),
        }));
        manifestList.unshift({
            id: 'toc-page',
            href: 'toc.xhtml',
            properties: 'nav',
        });

        // 处理封面
        if (cover) {
            manifestList.push({
                id: 'cover-image',
                href: await this.copyImage(cover),
                properties: 'cover-image',
            });
            await this.writeFile('EPUB/cover.xhtml', await render('EPUB/cover.xhtml', {
                cover,
            }));
            manifestList.unshift({
                id: 'cover-page',
                href: 'cover.xhtml',
            });
        }

        // 处理资源类型
        manifestList.forEach((item) => {
            const refItem = item;
            const { href } = item;
            const mediaType = mimeTypes.lookup(href);
            const isPage = mediaType === 'application/xhtml+xml';
            refItem.mediaType = mediaType;
            refItem.isPage = isPage;
        });
        const spineList = manifestList.filter((item) => item.isPage);

        // 生成基础文件
        await Promise.all([
            this.writeFile('mimetype', await render('mimetype')),
            this.writeFile('META-INF/container.xml', await render('META-INF/container.xml')),
            this.writeFile('EPUB/package.opf', await render('EPUB/package.opf.xml', {
                meta,
                manifestList,
                spineList,
            })),
        ]);

        // 打包
        const savePath = `${this.targetDir}.epub`;
        const zip = new AdmZip();
        zip.addLocalFolder(this.saveDir);
        zip.writeZip(savePath);

        // 清理
        if (!isDebug) {
            rimraf.sync(this.saveDir);
        }
        this.state = 'complete';
    }
}
