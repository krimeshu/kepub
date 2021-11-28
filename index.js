import fs from 'fs';
import path from 'path';

const work = (target) => {
    const targetDir = path.resolve(target);
    if (!fs.existsSync(targetDir)) {
        console.error(`Can't find target ${JSON.stringify(target)}.`);
        process.exit(1);
    }
    if (!fs.statSync(targetDir).isDirectory()) {
        console.error(`Target is not directory: ${JSON.stringify(target)}.`);
        process.exit(1);
    }
    const configPath = path.join(targetDir, 'book.json');
    if (!fs.existsSync(configPath)) {
        console.error(`Can't find "book.json" in target ${JSON.stringify(target)}.`);
        process.exit(1);
    }
};

work(...process.argv.slice(2));
