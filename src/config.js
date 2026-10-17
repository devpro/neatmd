import fs from 'node:fs';
import path from 'node:path';

const MARKDOWN_LENGTH = 240;
const SOURCE_LENGTH = 180;

// turns an EditorConfig section name into a test on a file name, the sections naming a directory are not supported
function sectionMatcher(pattern) {
  if (pattern.includes('/')) return () => false;

  const source = pattern
    .replace(/[.+^$()|\\[\]]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\{([^}]*)\}/g, (_, list) => `(?:${list.split(',').join('|')})`);
  const regex = new RegExp(`^${source}$`);
  return name => regex.test(name);
}

function isRoot(configPath) {
  for (let line of fs.readFileSync(configPath, 'utf8').split(/\r?\n/)) {
    line = line.trim();
    if (/^\[/.test(line)) return false;
    if (/^root\s*=\s*true\s*$/i.test(line)) return true;
  }
  return false;
}

// lists the .editorconfig files that apply to a folder, from the outermost to the closest, as the EditorConfig specification reads them
// the working directory plays no part, so a file gets the same settings wherever the command is run from
export function findConfigFiles(dirPath) {
  const found = [];
  let dir = path.resolve(dirPath);

  while (true) {
    const candidate = path.join(dir, '.editorconfig');
    if (fs.existsSync(candidate)) {
      found.unshift(candidate);
      if (isRoot(candidate)) break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return found;
}

// reads max_line_length for a file from one .editorconfig or a list of them, the last matching section of the closest file winning
// without a file the setting is the one of Markdown
export function loadConfig(configPaths, filePath = 'file.md') {
  const name = path.basename(filePath);
  const isMarkdown = name.toLowerCase().endsWith('.md');
  let maxLineLength = isMarkdown ? MARKDOWN_LENGTH : SOURCE_LENGTH;

  const paths = [configPaths].flat().filter(configPath => configPath && fs.existsSync(configPath));

  for (const configPath of paths) {
    let inSection = false;

    for (let line of fs.readFileSync(configPath, 'utf8').split(/\r?\n/)) {
      line = line.trim();
      const section = line.match(/^\[(.+)\]$/);
      if (section) {
        inSection = sectionMatcher(section[1])(name);
      } else if (inSection) {
        const match = line.match(/^max_line_length\s*=\s*(\d+)/);
        if (match) maxLineLength = parseInt(match[1], 10);
      }
    }
  }

  return { maxLineLength };
}
