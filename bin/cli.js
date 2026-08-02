#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, processFile, processDirectory } from '../src/index.js';

const optionsSchema = {
  output: { type: 'string', short: 'o' },
  help: { type: 'boolean', short: 'h' },
};

try {
  const { values, positionals } = parseArgs({ options: optionsSchema, allowPositionals: true });

  if (values.help || positionals.length === 0) {
    console.log('Usage: neatmd <file|directory> [-o <output-file>]');
    console.log('\nOptions:\n  -o, --output <file>  Specify output file\n  -h, --help           Show help');
    process.exit(0);
  }

  const targetPath = path.resolve(process.cwd(), positionals[0]);

  if (!fs.existsSync(targetPath)) {
    console.error(`✖ Error: Path does not exist "${positionals[0]}"`);
    process.exit(1);
  }

  const config = loadConfig();

  const stat = fs.statSync(targetPath);

  if (stat.isDirectory()) {
    if (values.output) {
      console.error('✖ Error: Cannot specify -o / --output when formatting a directory.');
      process.exit(1);
    }

    const count = processDirectory(targetPath, config);
    console.log(count > 0 ? `\nDone! Formatted ${count} file(s).` : 'All Markdown files are already neat!');
  } else {
    const options = { ...config, output: values.output };
    const modified = processFile(targetPath, options);
    if (!modified) {
      console.log(`File is already neat: ${positionals[0]}`);
    }
  }
} catch (error) {
  console.error(`✖ Error: ${error.message}`);
  process.exit(1);
}
