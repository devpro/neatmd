#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { format } from '../src/index.js';

const optionsSchema = {
  output: {
    type: 'string',
    short: 'o',
  },
  help: {
    type: 'boolean',
    short: 'h',
  },
};

try {
  const { values, positionals } = parseArgs({
    options: optionsSchema,
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0) {
    console.log('Usage: neatmd <file> [-o <output-file>]');
    console.log('\nOptions:');
    console.log('  -o, --output <file>  Specify a different output file');
    console.log('  -h, --help           Display this help menu');
    process.exit(0);
  }

  const inputFile = positionals[0];
  const outputFile = values.output || inputFile;

  const inputPath = path.resolve(process.cwd(), inputFile);
  const outputPath = path.resolve(process.cwd(), outputFile);

  const content = fs.readFileSync(inputPath, 'utf-8');
  const formatted = format(content);

  fs.writeFileSync(outputPath, formatted, 'utf-8');

  if (values.output) {
    console.log(`✔ Formatted ${inputFile} ➔ ${outputFile}`);
  } else {
    console.log(`✔ Formatted ${inputFile}`);
  }
} catch (error) {
  console.error(`✖ Error: ${error.message}`);
  process.exit(1);
}
