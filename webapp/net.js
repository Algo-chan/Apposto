// Talking to the server. The free host can be asleep when the app opens (it takes up to about a
// minute to wake), so network errors and 502/503/504 are retried; real answers (4xx) are not.

const RETRY_STATUS = new Set([502, 503, 504]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * -> { ok, status, body }. status 0 + { error: 'NETWORK' } when the server never answered.
 * onRetry(attempt) lets the page show "Connecting…".
 */
export async function requestWithRetry(fetchFn, url, opts = {}, { tries = 6, delayMs = 3000, sleep = wait, onRetry } = {}) {
  let last = { ok: false, status: 0, body: { error: 'NETWORK' } };
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetchFn(url, opts);
      let body = {};
      try {
        body = await res.json();
      } catch {
        /* empty or not JSON */
      }
      last = { ok: res.ok, status: res.status, body };
      if (!RETRY_STATUS.has(res.status)) return last;
    } catch {
      last = { ok: false, status: 0, body: { error: 'NETWORK' } };
    }
    if (attempt < tries) {
      onRetry?.(attempt);
      await sleep(delayMs);
    }
  }
  return last;
}

// A sleeping free server takes up to about a minute to wake: 20 waits of 3 s.
const APP_TRIES = 21;

/** api(path, { method, body }) for the page: adds the Telegram sign-in and JSON. */
export function createApi({ initData, fetchFn = (...a) => fetch(...a), onRetry, sleep = wait } = {}) {
  return (path, { method = 'GET', body } = {}) =>
    requestWithRetry(
      fetchFn,
      path,
      {
        method,
        headers: { Authorization: `tma ${initData}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
      { tries: APP_TRIES, onRetry, sleep }
    );
}
