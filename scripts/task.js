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

const isDebug = true;

const tempDir = isDebug ? './.temp'
    : path.join(os.tmpdir(), 'kepub');

const RENDER_CONCURR_RESTRI = 10;
const COPY_CONCURR_RESTRI = 5;

const flatternPages = (pages) => {
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
            const { list: subList, toc: subToc } = flatternPages(children);
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

    async copyImage({ src, saveAs }) {
        const { targetDir, saveDir } = this;
        const srcPath = path.join(targetDir, src);
        const savePath = path.join(saveDir, saveAs);

        // console.log(`[copy-image] from: ${srcPath}\n  to: ${savePath}`);
        const dirPath = path.dirname(savePath);
        await mkdirp(dirPath);

        return new Promise((rs, rj) => {
            pipeline(
                createReadStream(srcPath),
                createWriteStream(savePath),
                (err) => {
                    if (err) rj(err);
                    rs();
                },
            );
        });
    }

    async renderPages(list) {
        const { targetDir } = this;
        const imageList = [];
        const resList = [];

        // 渲染单个页面
        const renderPage = async (page) => {
            const {
                title: titleOrNot,
                file,
                saveAs,
            } = page;

            const filePath = path.join(targetDir, file);
            const {
                title,
                content,
                images,
            } = await renderMdPage(filePath, {
                titleOrNot,
            });

            if (titleOrNot !== title) {
                const refPage = page;
                refPage.title = title;
            }

            const pageDir = path.dirname(file);
            images.forEach((relSrc) => {
                // 处理图片相对路径
                const src = path.join(pageDir, relSrc);
                const saveImage = `EPUB/${src}`;
                resList.push(src);
                imageList.push({
                    src,
                    saveAs: saveImage,
                });
            });

            return this.writeFile(saveAs, content);
        };

        // 并发处理页面
        await asyncPool(RENDER_CONCURR_RESTRI, list, renderPage);

        const copyImage = (image) => this.copyImage(image);
        // 并发复制图片
        await asyncPool(COPY_CONCURR_RESTRI, imageList, copyImage);

        return {
            resList,
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
        } = this.config;
        const {
            list: pageList,
            toc: pageTree,
        } = flatternPages(pages);

        // 处理页面参数
        const resList = [];
        pageList.forEach((page) => {
            const refPage = page;
            const basePath = page.file.replace(/\.md$/i, '');
            const href = `${basePath}.xhtml`;
            refPage.href = href;
            if (!page.saveAs) {
                const saveAs = `EPUB/${href}`;
                refPage.saveAs = saveAs;
            }
            resList.push(href);
        });

        const {
            resList: pageResList,
        } = await this.renderPages(pageList);
        resList.push(...pageResList);

        // 处理资源清单
        const manifestList = resList.map((href, index) => {
            const id = `res-${index}`;
            const mediaType = mimeTypes.lookup(href);
            const isPage = mediaType === 'application/xhtml+xml';
            return {
                id,
                href,
                mediaType,
                isPage,
            };
        });

        // 生成目录
        await this.writeFile('EPUB/toc.xhtml', await render('EPUB/toc.xhtml', {
            tocHtml: parseToc(pageTree),
        }));
        manifestList.unshift({
            id: 'htmltoc',
            href: 'toc.xhtml',
            mediaType: 'application/xhtml+xml',
            properties: 'nav',
            isPage: true,
        });

        // 处理封面
        if (cover) {
            const coverSaveAs = `EPUB/${cover}`;
            await this.copyImage({
                src: cover,
                saveAs: coverSaveAs,
            });
            manifestList.push({
                id: 'cover-image',
                href: cover,
                mediaType: mimeTypes.lookup(cover),
                properties: 'cover-image',
            });
            await this.writeFile('EPUB/cover.xhtml', await render('EPUB/cover.xhtml', {
                cover,
            }));
            manifestList.unshift({
                id: 'cover-page',
                href: 'cover.xhtml',
                mediaType: 'application/xhtml+xml',
                isPage: true,
            });
        }

        // 生成基础文件
        await Promise.all([
            this.writeFile('mimetype', await render('mimetype')),
            this.writeFile('META-INF/container.xml', await render('META-INF/container.xml')),
            this.writeFile('EPUB/package.opf', await render('EPUB/package.opf.xml', {
                meta,
                manifestList,
                pageTree,
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