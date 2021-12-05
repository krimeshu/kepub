import fs from 'fs/promises';
import path from 'path';

import Task from './scripts/task.js';

const work = async (target) => {
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

work(...process.argv.slice(2));
