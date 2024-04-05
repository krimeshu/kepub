import fs from 'fs/promises';
import path from 'path';

import { marked } from 'marked';
import { load as loadHtml } from 'cheerio';
import { URL, fileURLToPath } from 'url';

const dirname = fileURLToPath(new URL('./', import.meta.url));

export const render = async (templateName, args = {}) => {
    const filePath = path.join(dirname, '../templates', templateName);
    try {
        await fs.access(filePath);
    } catch (ex) {
        throw Error(`TemplateError: can't find template ${JSON.stringify(templateName)}\n  at path: ${filePath}`);
    }
    const template = (await fs.readFile(filePath)).toString();
    const argKeys = Object.keys(args);
    const argValues = argKeys.map((key) => args[key]);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...argKeys, `return \`${template}\`;`);
    return fn(...argValues);
};

export const renderMdPage = async (filePath, args = {}) => {
    try {
        await fs.access(filePath);
    } catch (ex) {
        throw Error(`RenderError: can't find file ${JSON.stringify(filePath)}`);
    }
    const markdown = await fs.readFile(filePath);
    const html = marked.parse(markdown.toString());
    const $ = loadHtml(html);
    const firstElem = $('body>*').eq(0);
    const firstTitle = firstElem.is('h1,h2,h3,h4,h5,h6') ? firstElem.text() : null;
    const images = $('img').map((_, el) => $(el).attr('src')).get();

    const {
        title = firstTitle || 'Untitled Page',
    } = args;

    const content = await render('EPUB/book-page.xhtml', {
        title,
        content: html.replace(/(<img[^>]+[^/])>/g, '$1/>'),
    });

    return {
        title,
        content,
        images,
    };
};
