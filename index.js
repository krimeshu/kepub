import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, URL } from 'url';

import Task from './scripts/task.js';
import { formatTime } from './scripts/utils.js';

const dirname = fileURLToPath(new URL('./', import.meta.url));

export const build = async (target = '') => {
    const targetDir = path.resolve(target);
    await fs.access(targetDir);
    if (!(await fs.stat(targetDir)).isDirectory()) {
        console.error(`Target is not directory: ${JSON.stringify(target)}.`);
        process.exit(1);
    }
    const configPath = path.join(targetDir, 'book.json');
    try {
        await fs.access(configPath);
    } catch (ex) {
        console.error(`Can't find "book.json" in target ${JSON.stringify(target)}.`);
        process.exit(1);
    }
    if (!(await fs.stat(configPath)).isFile()) {
        throw new Error('ConfigError: "book.json" is not file.');
    }
    const config = JSON.parse(await fs.readFile(configPath));

    // TODO: 更多参数检查

    const task = new Task(targetDir, config);
    await task.run();
};

export const create = async (target = '', lang = 'en') => {
    if (!target) {
        console.log('Please input a book name.');
        return;
    }
    const targetPath = path.resolve(target);
    const existed = await fs.access(targetPath).then(() => true, () => false);
    if (existed) {
        console.log(`Failed: target ${JSON.stringify(target)} is already existed.`);
        console.log();
        return;
    }
    const examplePath = path.join(dirname, 'example/markdown');
    try {
        console.log('Creating from example...');
        await fs.cp(examplePath, targetPath, {
            recursive: true,
        });
        const infoPath = path.join(targetPath, 'book.json');
        const info = JSON.parse((await fs.readFile(infoPath)).toString());
        const now = new Date();
        Object.assign(info.meta, {
            id: `kepub:${formatTime('yyyyMMdd', now)}:${now.getTime()}`,
            title: target,
            lang,
            date: formatTime('yyyy-MM-dd', now),
            modified: now.toISOString(),
        });
        await fs.writeFile(infoPath, JSON.stringify(info, null, 2));
    } catch (ex) {
        console.error(ex);
        console.log();
        console.log('Create failed.');
        console.log();
    }
    console.log('Done:', targetPath);
};
