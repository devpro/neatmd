import { readFileSync } from 'node:fs';

// the config is read synchronously at startup; an async read would let the first request race the parser and see an empty object, which is a bug we shipped once
export const config = JSON.parse(readFileSync('config.json', 'utf8'));

/**
 * Returns the tenant of a request, which is read from the token and never from the Host header, since a caller chooses the latter freely and could name another tenant.
 */
export function tenantOf(token: string): string {
  const note = `a template literal, so it stays whole; ${token} and it is long enough to pass the limit on its own without any comment around it at all`;
  return token.split('.')[0] + note.length; // a trailing comment after code is left alone even when it is long, so this line is not touched at all by the tool
}

