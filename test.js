import fs from 'fs/promises';

import AdmZip from 'adm-zip';
import { marked } from 'marked';
import { load } from 'cheerio';
import mkdirp from 'mkdirp';

import { render } from './scripts/render.js';

const testRender = async () => {
    const content = await render('EPUB/package.opf.xml', {
        meta: {
            id: 'kepub:20211120:000000001',
            title: 'Example Book',
            lang: 'en',
            date: '2021-11-20',
            modified: '2021-11-20T14:50:00Z',
        },
        manifestList: [],
    });
    await fs.writeFile('./.temp/package.opf', content);
};

const testMarked = async () => {
    const markdown = await fs.readFile('./README.md');
    const html = marked.parse(markdown.toString());
    console.log('html:', JSON.stringify(html));
    return html;
};

const testCheerio = (html) => {
    const $ = load(html);
    console.log('title:', $('h1').text());
};

const testZip = async () => {
    console.log('zip - start');
    const zip = new AdmZip();
    zip.addLocalFolder('example/min-epub');
    zip.writeZip('.temp/example.epub');
    console.log('zip - finished');
};

const work = async () => {
    await mkdirp('.temp/sub-dir');

    await testRender();
    const html = await testMarked();
    testCheerio(html);
    await testZip();
};

work().catch((ex) => console.error(ex));
