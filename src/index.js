import { formatMarkdown } from './formatter.js';

export function format(content) {
  return formatMarkdown(content, 240);
}
