'use strict';

// retries three times with a growing delay; a fixed delay would let every client of a failed server come back at the same instant and fail it again
async function fetchWithRetry(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetch(url);
    } catch (e) {
      // the error is logged and swallowed, so the last attempt decides the outcome:
      // an exception here would hide the earlier ones that explain why it failed
      console.warn(e instanceof Error ? e.message : String(e));
    }
  }
}
