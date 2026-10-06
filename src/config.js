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

// reads max_line_length for a file, the last matching section winning
// without a file the setting is the one of Markdown
export function loadConfig(configPath, filePath = 'file.md') {
  const name = path.basename(filePath);
  const isMarkdown = name.toLowerCase().endsWith('.md');
  let maxLineLength = isMarkdown ? MARKDOWN_LENGTH : SOURCE_LENGTH;

  if (!configPath || !fs.existsSync(configPath)) {
    return { maxLineLength };
  }

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

  return { maxLineLength };
}
