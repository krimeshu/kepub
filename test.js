import AdmZip from 'adm-zip';
import { marked } from 'marked';

const testZip = () => {
    // creating archives
    const zip = new AdmZip();

    // add file directly
    const content = 'inner content of the file';
    zip.addFile('test.txt', Buffer.from(content, 'utf8'), 'entry comment goes here');
    // add local file
    zip.addLocalFile('./package.json');
    // get everything as a buffer
    // var willSendthis = zip.toBuffer();
    // or write everything to disk
    zip.writeZip(/* target file name */ './files.zip');
};

const testMarked = () => {
    const html = marked.parse('# Marked in Node.js\n\nRendered by **marked**.');
    return html;
};

console.log(testMarked() || testZip());
