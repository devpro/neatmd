#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { processFile, processDirectory } from '../src/index.js';

const pkgPath = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

const optionsSchema = {
  output: { type: 'string', short: 'o' },
  check: { type: 'boolean', short: 'c' },
  comments: { type: 'boolean' },
  version: { type: 'boolean', short: 'V' },
  help: { type: 'boolean', short: 'h' },
};

try {
  const { values, positionals } = parseArgs({ options: optionsSchema, allowPositionals: true });

  if (values.version) {
    console.log(`neatmd v${pkg.version}`);
    process.exit(0);
  }

  if (values.help || positionals.length === 0) {
    console.log('Usage: neatmd <file|directory>... [options]');
    console.log('\nOptions:');
    console.log('  -c, --check          Check if files are formatted without writing');
    console.log('      --comments       Also break long comments in source files of a directory');
    console.log('  -o, --output <file>  Specify output file (single file mode only)');
    console.log('  -V, --version        Show version number');
    console.log('  -h, --help           Show help menu');
    process.exit(0);
  }

  if (values.check && values.output) {
    console.error('✖ Error: Cannot use --check and --output together.');
    process.exit(1);
  }

  const targets = positionals.map(positional => {
    const targetPath = path.resolve(process.cwd(), positional);

    if (!fs.existsSync(targetPath)) {
      console.error(`✖ Error: Path does not exist "${positional}"`);
      process.exit(1);
    }

    return { targetPath, isDirectory: fs.statSync(targetPath).isDirectory() };
  });

  if (values.output && (targets.length > 1 || targets[0].isDirectory)) {
    console.error('✖ Error: --output only applies to a single file.');
    process.exit(1);
  }

  let modifiedCount = 0;
  let hasDirectory = false;

  for (const { targetPath, isDirectory } of targets) {
    const options = { comments: values.comments, check: values.check, output: values.output };

    if (isDirectory) {
      hasDirectory = true;
      modifiedCount += processDirectory(targetPath, options);
    } else if (processFile(targetPath, options)) {
      modifiedCount++;
    }
  }

  if (values.check) {
    if (modifiedCount > 0) {
      console.error(`\n✖ Check failed: ${modifiedCount} file(s) need formatting.`);
      process.exit(1);
    } else {
      console.log('✔ All files are properly formatted!');
      process.exit(0);
    }
  } else {
    if (modifiedCount === 0) {
      console.log('All files are already neat!');
    } else if (hasDirectory || targets.length > 1) {
      console.log(`\nDone! Formatted ${modifiedCount} file(s).`);
    }
  }
} catch (error) {
  console.error(`✖ Error: ${error.message}`);
  process.exit(1);
}
