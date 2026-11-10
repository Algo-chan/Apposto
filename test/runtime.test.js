import test from 'node:test';
import assert from 'node:assert/strict';
import { createHealthHandler, superviseRunner, startKeepAlive } from '../src/runtime.js';

const fakeRes = () => {
  const res = { status: null, body: '' };
  res.writeHead = (s) => { res.status = s; };
  res.end = (b) => { res.body = b; };
  return res;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('health 200 while running', () => {
  const handler = createHealthHandler({ isRunning: () => true });
  for (const url of ['/', '/health']) {
    const res = fakeRes();
    handler({ url }, res);
    assert.equal(res.status, 200);
    assert.equal(JSON.parse(res.body).runner, 'running');
    assert.equal(JSON.parse(res.body).ok, true);
  }
});

test('health 503 when stopped', () => {
  const handler = createHealthHandler({ isRunning: () => false });
  const res = fakeRes();
  handler({ url: '/health' }, res);
  assert.equal(res.status, 503);
  assert.equal(JSON.parse(res.body).runner, 'stopped');
});

test('health 404 for other paths', () => {
  const handler = createHealthHandler({ isRunning: () => true });
  const res = fakeRes();
  handler({ url: '/nope' }, res);
  assert.equal(res.status, 404);
});

test('crash triggers onCrash', async () => {
  const calls = [];
  superviseRunner({ task: () => Promise.resolve() }, { onCrash: (r) => calls.push(r), isStopping: () => false });
  await sleep(10);
  assert.equal(calls.length, 1);
});

test('rejected task triggers onCrash with the reason', async () => {
  const calls = [];
  const err = new Error('boom');
  superviseRunner({ task: () => Promise.reject(err) }, { onCrash: (r) => calls.push(r), isStopping: () => false });
  await sleep(10);
  assert.deepEqual(calls, [err]);
});

test('undefined task counts as stopped', async () => {
  const calls = [];
  superviseRunner({ task: () => undefined }, { onCrash: (r) => calls.push(r), isStopping: () => false });
  await sleep(10);
  assert.equal(calls.length, 1);
});

test('planned stop does not', async () => {
  const calls = [];
  superviseRunner({ task: () => Promise.resolve() }, { onCrash: (r) => calls.push(r), isStopping: () => true });
  await sleep(10);
  assert.equal(calls.length, 0);
});

test('keep-alive pings /health', async () => {
  const urls = [];
  const stop = startKeepAlive({
    baseUrl: 'https://x.onrender.com',
    intervalMs: 10,
    fetchFn: async (u) => { urls.push(u); },
  });
  // wait for two pings (up to 2 s: a busy test machine can delay 10 ms timers a lot)
  for (let waited = 0; urls.length < 2 && waited < 2000; waited += 10) await sleep(10);
  stop();
  assert.ok(urls.length >= 2);
  assert.ok(urls.every((u) => u === 'https://x.onrender.com/health'));
});

test('keep-alive off without url', async () => {
  let n = 0;
  const stop = startKeepAlive({ baseUrl: '', intervalMs: 10, fetchFn: async () => { n++; } });
  await sleep(35);
  stop();
  assert.equal(n, 0);
});

test('keep-alive survives fetch errors', async () => {
  const logs = [];
  const stop = startKeepAlive({
    baseUrl: 'https://x.onrender.com',
    intervalMs: 10,
    fetchFn: async () => { throw new Error('offline'); },
    log: (...a) => logs.push(a),
  });
  await sleep(35);
  stop();
  assert.ok(logs.length >= 1);
});

test('keep-alive gives up on a ping that hangs', async () => {
  const logs = [];
  const stop = startKeepAlive({
    baseUrl: 'https://x.onrender.com',
    intervalMs: 10,
    timeoutMs: 15,
    // a request that never answers: only the abort signal ends it
    fetchFn: (_u, { signal } = {}) =>
      new Promise((_, reject) => signal?.addEventListener('abort', () => reject(signal.reason))),
    log: (msg) => logs.push(msg),
  });
  await sleep(80);
  stop();
  assert.ok(logs.length >= 1, 'a hung ping is reported');
  assert.match(logs[0], /Keep-alive ping failed/);
});
