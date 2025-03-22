#!/usr/bin/env node

import * as kepub from './index.js';

const [funcName, ...args] = process.argv.slice(2);

kepub[funcName](...args);
