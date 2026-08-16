#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig, processFile, processDirectory } from '../src/index.js';

const pkgPath = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

const optionsSchema = {
  output: { type: 'string', short: 'o' },
  check: { type: 'boolean', short: 'c' },
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
    console.log('Usage: neatmd <file|directory> [options]');
    console.log('\nOptions:');
    console.log('  -c, --check          Check if files are formatted without writing');
    console.log('  -o, --output <file>  Specify output file (single file mode only)');
    console.log('  -V, --version        Show version number');
    console.log('  -h, --help           Show help menu');
    process.exit(0);
  }

  if (values.check && values.output) {
    console.error('✖ Error: Cannot use --check and --output together.');
    process.exit(1);
  }

  const targetPath = path.resolve(process.cwd(), positionals[0]);

  if (!fs.existsSync(targetPath)) {
    console.error(`✖ Error: Path does not exist "${positionals[0]}"`);
    process.exit(1);
  }

  const stat = fs.statSync(targetPath);

  if (values.output && stat.isDirectory()) {
    console.error('✖ Error: --output only applies to a single file.');
    process.exit(1);
  }

  const targetDir = stat.isDirectory() ? targetPath : path.dirname(targetPath);
  const configPath = [
    path.join(targetDir, '.editorconfig'),
    path.join(process.cwd(), '.editorconfig')
  ].find(fs.existsSync);

  const config = loadConfig(configPath);
  const options = { ...config, check: values.check, output: values.output };

  const modifiedCount = stat.isDirectory()
    ? processDirectory(targetPath, options)
    : (processFile(targetPath, options) ? 1 : 0);

  if (values.check) {
    if (modifiedCount > 0) {
      console.error(`\n✖ Check failed: ${modifiedCount} file(s) need formatting.`);
      process.exit(1);
    } else {
      console.log('✔ All Markdown files are properly formatted!');
      process.exit(0);
    }
  } else {
    if (modifiedCount === 0) {
      console.log('All Markdown files are already neat!');
    } else if (stat.isDirectory()) {
      console.log(`\nDone! Formatted ${modifiedCount} file(s).`);
    }
  }
} catch (error) {
  console.error(`✖ Error: ${error.message}`);
  process.exit(1);
}
