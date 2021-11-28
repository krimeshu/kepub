import fs from 'fs';
import AdmZip from 'adm-zip';
import { marked } from 'marked';
import { load } from 'cheerio';

const testZip = () => {
    const zip = new AdmZip();
    zip.addLocalFolder('example');
    if (!fs.existsSync('.temp')) fs.mkdirSync('.temp');
    zip.writeZip('.temp/example.epub');
};

const testMarked = () => {
    const html = marked.parse('# Marked in Node.js\n\nRendered by **marked**.');
    console.log('html:', JSON.stringify(html));
    return html;
};

const testCheerio = (html) => {
    const $ = load(html);
    console.log('title:', $('h1').text());
};

const html = testMarked();
testCheerio(html);
testZip();
