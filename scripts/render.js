import fs from 'fs/promises';
import path from 'path';

import { marked } from 'marked';
import { load as loadHtml } from 'cheerio';

const dirname = path.dirname(import.meta.url.replace(/^file:\/\/?/, ''));

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
    const firstH1 = $('h1').text();
    const images = $('img').map((_, el) => $(el).attr('src')).get();

    const {
        title = firstH1 || 'Untitled Page',
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
