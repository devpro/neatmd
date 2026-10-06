import fs from 'node:fs';
import path from 'node:path';
import { formatMarkdown } from './formatter.js';
import { loadConfig } from './config.js';
import { splitComments, commentStyleOf } from './comments.js';

const DEFAULT_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'bin',
  'obj',
  'dist',
  'build',
  '.next',
  'vendor',
  'third_party'
]);

// bin and obj are build output next to a .NET project, and source anywhere else, such as the bin of a Node package
function isBuildOutput(dirPath, name) {
  return ['bin', 'obj'].includes(name)
    && fs.readdirSync(dirPath).some(entry => /\.(csproj|fsproj|vbproj|sln)$/.test(entry));
}

// a folder holding libraries copied into a web root is third party code
function isVendored(dirPath, name) {
  return name === 'lib' && path.basename(dirPath) === 'wwwroot';
}

export function processFile(filePath, options = {}) {
  const content = fs.readFileSync(filePath, 'utf-8');

  const style = commentStyleOf(filePath);
  let formatted;
  if (style) {
    // a source file only has its long comments broken, whatever else it holds is left as written
    const maxLength = loadConfig(options.configPath, filePath).maxLineLength;
    const result = splitComments(content, maxLength, style);
    result.stuck.forEach(item => console.warn(`⚠ No safe break: ${filePath}:${item.line}: ${item.text}`));
    formatted = result.content;
  } else {
    formatted = formatMarkdown(content, options);
  }
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
    if (options.comments) {
      // a run over source files has to reach bin of a Node package, while a Markdown run keeps skipping it
      if (DEFAULT_IGNORED_DIRS.has(file) && !['bin', 'obj'].includes(file)) continue;
      if (isBuildOutput(dirPath, file) || isVendored(dirPath, file)) continue;
    } else if (DEFAULT_IGNORED_DIRS.has(file)) {
      continue;
    }

    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      modifiedCount += processDirectory(fullPath, options);
    } else if (file.endsWith('.md') || (options.comments && commentStyleOf(file))) {
      if (processFile(fullPath, options)) {
        modifiedCount++;
      }
    }
  }

  return modifiedCount;
}
