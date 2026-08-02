import fs from 'node:fs';
import path from 'node:path';
import { formatMarkdown } from './formatter.js';

const DEFAULT_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'bin',
  'obj',
  'dist',
  'build',
  '.next'
]);

export function processFile(filePath, options = {}) {
  const content = fs.readFileSync(filePath, 'utf-8');

  const formatted = formatMarkdown(content, options);

  if (content === formatted) {
    return false;
  }

  if (options.check) {
    console.log(`✖ Needs formatting: ${filePath}`);
    return true;
  }

  const outputPath = options.output || filePath;
  fs.writeFileSync(outputPath, formatted, 'utf-8');
  console.log(`✔ Formatted: ${filePath}`);
  return true;
}

export function processDirectory(dirPath, options = {}) {
  const files = fs.readdirSync(dirPath);
  let modifiedCount = 0;

  for (const file of files) {
    if (DEFAULT_IGNORED_DIRS.has(file)) continue;

    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      modifiedCount += processDirectory(fullPath, options);
    } else if (file.endsWith('.md')) {
      if (processFile(fullPath, options)) {
        modifiedCount++;
      }
    }
  }

  return modifiedCount;
}
