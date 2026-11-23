import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { formatMarkdown } from './formatter.js';
import { loadConfig, findConfigFiles } from './config.js';
import { splitComments, commentStyleOf } from './comments.js';
import { unifiedDiff } from './diff.js';
import { findLongLines } from './length.js';
import { findMarkdownlintLength } from './markdownlint.js';

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

function hasDotnetProject(dirPath) {
  return fs.readdirSync(dirPath).some(entry => /\.(csproj|fsproj|vbproj|sln)$/.test(entry));
}

// bin and obj are build output next to a .NET project, and source anywhere else, such as the bin of a Node package
function isBuildOutput(dirPath, name) {
  return ['bin', 'obj'].includes(name) && hasDotnetProject(dirPath);
}

// a folder holding libraries copied into a web root is third party code
// so is the Scripts folder of an ASP.NET project, where NuGet copies jQuery and its plugins
function isVendored(dirPath, name) {
  return (name === 'lib' && path.basename(dirPath) === 'wwwroot')
    || (name === 'Scripts' && hasDotnetProject(dirPath));
}

// asks git once per folder, so the rules of every nested .gitignore and of the global excludes apply
// outside a repository, or without git installed, nothing is ignored
function gitIgnoredEntries(dirPath, names) {
  if (names.length === 0) return new Set();
  try {
    const output = execFileSync('git', ['check-ignore', '-z', '--stdin'], {
      cwd: dirPath,
      input: names.join('\0') + '\0',
      stdio: ['pipe', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024
    });
    return new Set(output.toString().split('\0').filter(Boolean));
  } catch {
    return new Set();
  }
}

// one warning per configuration and length, as a run would otherwise repeat it for every file
const warnedLengths = new Set();

function warnLengthMismatch(filePath, maxLineLength) {
  const markdownlint = findMarkdownlintLength(path.dirname(path.resolve(filePath)));
  if (markdownlint === null || markdownlint.length === maxLineLength) return;

  const message = `⚠ Line length differs: ${maxLineLength} in .editorconfig, ${markdownlint.length} in ${markdownlint.configPath}`;
  if (warnedLengths.has(message)) return;
  warnedLengths.add(message);
  console.warn(message);
}

function reportDiff(filePath, content, formatted) {
  // a change of line endings makes every line differ, which would hide the changes of the text
  const toUnix = text => text.replaceAll('\r\n', '\n');
  if (content.includes('\r\n') && !formatted.includes('\r\n')) {
    console.log('Line endings: CRLF, written as LF');
  }
  const diff = unifiedDiff(toUnix(content), toUnix(formatted));
  if (diff !== '') {
    console.log(`--- ${filePath}\toriginal\n+++ ${filePath}\tformatted\n${diff.slice(0, -1)}`);
  }
}

export function processFile(filePath, options = {}) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // a length given by the caller wins, otherwise each file reads the .editorconfig files above it, so a nested one applies to its own folder
  const maxLineLength = options.maxLineLength
    ?? loadConfig(findConfigFiles(path.dirname(path.resolve(filePath))), filePath).maxLineLength;

  const style = commentStyleOf(filePath);
  let formatted;
  if (style) {
    // a source file only has its long comments broken, whatever else it holds is left as written
    const result = splitComments(content, maxLineLength, style);
    result.stuck.forEach(item => console.warn(`⚠ No safe break: ${filePath}:${item.line}: ${item.text}`));
    formatted = result.content;
  } else {
    if (options.maxLineLength === undefined) warnLengthMismatch(filePath, maxLineLength);
    formatted = formatMarkdown(content, { ...options, maxLineLength });
  }
  const isModified = content !== formatted;

  if (options.check) {
    if (isModified) {
      console.log(`✖ Needs formatting: ${filePath}`);
      reportDiff(filePath, content, formatted);
    }

    // the text is never shortened to fit, so a line left over the limit is for its author to rewrite
    // it does not fail the check, as formatting the file would not fix it
    for (const { line, length } of style ? [] : findLongLines(formatted, maxLineLength)) {
      const suffix = isModified ? ' (after formatting)' : '';
      console.warn(`⚠ Line too long: ${filePath}:${line}: ${length} characters, limit ${maxLineLength}${suffix}`);
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
  const entries = fs.readdirSync(dirPath);
  const ignored = gitIgnoredEntries(dirPath, entries);
  const files = entries.filter(entry => !ignored.has(entry));
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
