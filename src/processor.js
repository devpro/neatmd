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
  const isModified = content !== formatted;

  if (options.check) {
    if (isModified) {
      console.log(`✖ Needs formatting: ${filePath}`);
    }
    return isModified;
  }

  // an explicit output file is always written, even when the source is already neat, otherwise the requested file would be missing
  if (!isModified && !options.output) {
    return false;
  }

  fs.writeFileSync(options.output || filePath, formatted, 'utf-8');
  console.log(`✔ Formatted: ${filePath}`);
  return isModified;
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
