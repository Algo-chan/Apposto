// Tests for the timeout and retry helper used around Google Sheets calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import ky, { NetworkError } from 'ky';
import { withTimeout, withRetry, isRetryable } from '../src/storage/retry.js';
import { newSpreadsheet } from '../src/storage/sheetsStore.js';

const quiet = { sleep: async () => {}, log: () => {} };

test('withTimeout rejects slow promise', async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 20, 'x'),
    (err) => err.name === 'TimeoutError' && /x/.test(err.message) && /20/.test(err.message),
  );
});

test('retries 429 then succeeds', async () => {
  let calls = 0;
  const fn = async () => {
    calls++;
    if (calls <= 2) throw { response: { status: 429 } };
    return 'ok';
  };
  assert.equal(await withRetry(fn, { label: 't', ...quiet }), 'ok');
  assert.equal(calls, 3);
});

test('gives up after 3 tries', async () => {
  let calls = 0;
  const err = { response: { status: 503 } };
  const fn = async () => {
    calls++;
    throw err;
  };
  await assert.rejects(withRetry(fn, { label: 't', ...quiet }), (e) => e === err);
  assert.equal(calls, 3);
});

test('does not retry 400', async () => {
  let calls = 0;
  const fn = async () => {
    calls++;
    throw { response: { status: 400 } };
  };
  await assert.rejects(withRetry(fn, { label: 't', ...quiet }));
  assert.equal(calls, 1);
});

test('retries ECONNRESET and TimeoutError when idempotent', () => {
  assert.equal(isRetryable({ code: 'ECONNRESET' }, { idempotent: true }), true);
  assert.equal(isRetryable({ name: 'TimeoutError' }, { idempotent: true }), true);
});

test('non-idempotent retries only certain failures', () => {
  const o = { idempotent: false };
  assert.equal(isRetryable({ response: { status: 429 } }, o), true);
  assert.equal(isRetryable({ code: 'ECONNREFUSED' }, o), true);
  assert.equal(isRetryable({ code: 'ENOTFOUND' }, o), true);
  assert.equal(isRetryable({ response: { status: 503 } }, o), false);
  assert.equal(isRetryable({ code: 'ECONNRESET' }, o), false);
  assert.equal(isRetryable({ name: 'TimeoutError' }, o), false);
});

/** A real ky NetworkError: a request to a localhost port nobody listens on. */
async function kyConnectionRefused() {
  const server = net.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  await new Promise((r) => server.close(r));
  try {
    await ky.get(`http://127.0.0.1:${port}/`, { retry: 0 });
  } catch (err) {
    return err;
  }
  throw new Error('expected the request to fail');
}

test('ky network errors are retryable; for appends only when the request never left', async () => {
  const refused = await kyConnectionRefused();
  assert.equal(refused.name, 'NetworkError');
  assert.equal(isRetryable(refused, { idempotent: true }), true);
  assert.equal(isRetryable(refused, { idempotent: false }), true); // ECONNREFUSED: never reached Google

  // ky's wrapping of a connection that broke mid-request: NetworkError -> TypeError -> ECONNRESET
  const sys = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
  const reset = new NetworkError(new Request('https://sheets.googleapis.com/v4/x'), {
    cause: new TypeError('fetch failed', { cause: sys }),
  });
  assert.equal(isRetryable(reset, { idempotent: true }), true);
  assert.equal(isRetryable(reset, { idempotent: false }), false); // may have reached Google
});

test('withRetry retries a ky network error and logs its cause code', async () => {
  const refused = await kyConnectionRefused();
  const lines = [];
  let calls = 0;
  const fn = async () => {
    if (++calls === 1) throw refused;
    return 'ok';
  };
  assert.equal(await withRetry(fn, { label: 't', sleep: async () => {}, log: (s) => lines.push(s) }), 'ok');
  assert.equal(calls, 2);
  assert.match(lines[0], /ECONNREFUSED/);
});

test('the spreadsheet client does not retry underneath withRetry', async () => {
  const doc = newSpreadsheet('sheet-id', { token: 'test-token' });
  let calls = 0;
  const fetch = async () => {
    calls++;
    return new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } });
  };
  await assert.rejects(doc.sheetsApi.get('', { fetch }), (err) => err.response?.status === 503);
  assert.equal(calls, 1);
});
