import fs from 'node:fs';

export function loadConfig(configPath) {
  const defaultConfig = { maxLineLength: 240 };

  if (!configPath || !fs.existsSync(configPath)) {
    return defaultConfig;
  }

  const content = fs.readFileSync(configPath, 'utf8');
  let inMdSection = false;
  let maxLineLength = defaultConfig.maxLineLength;

  for (let line of content.split(/\r?\n/)) {
    line = line.trim();
    if (line.startsWith('[')) {
      inMdSection = line.includes('*.md') || line === '[*]';
    } else if (inMdSection && line.startsWith('max_line_length')) {
      const match = line.match(/max_line_length\s*=\s*(\d+)/);
      if (match) maxLineLength = parseInt(match[1], 10);
    }
  }

  return { maxLineLength };
}
