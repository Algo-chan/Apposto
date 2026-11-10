// The mini app's DOM-free modules (basket, network retry, texts), run in Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBasket, add, remove, count, foodTotal } from '../webapp/basket.js';
import { requestWithRetry } from '../webapp/net.js';
import { STRINGS, tr, ERROR_CODES } from '../webapp/strings.js';

test('basket: add, the 20 cap, remove down to nothing, count and total', () => {
  let b = createBasket();
  assert.deepEqual(b, { merchantId: null, items: {}, custom: '' });
  b = add(b, 'M1', 'I1');
  b = add(b, 'M1', 'I1');
  b = add(b, 'M1', 'I2');
  assert.equal(b.merchantId, 'M1');
  assert.equal(count(b), 3);
  const prices = new Map([['I1', { price: 250 }], ['I2', { price: 120 }]]);
  assert.equal(foodTotal(b, prices), 620);
  for (let i = 0; i < 30; i++) b = add(b, 'M1', 'I2');
  assert.equal(b.items.I2, 20);
  b = remove(b, 'I1');
  assert.equal(b.items.I1, 1);
  b = remove(b, 'I1');
  assert.equal('I1' in b.items, false);
  assert.equal(foodTotal(b, new Map()), 0, 'items no longer on the menu count as nothing');
});

test('basket: another shop asks to switch, unless the basket is empty', () => {
  const b = add(createBasket(), 'M1', 'I1');
  assert.deepEqual(add(b, 'M2', 'X1'), { needsSwitch: true });
  const emptied = remove(b, 'I1');
  assert.equal(add(emptied, 'M2', 'X1').merchantId, 'M2');
});

test('basket: a saved basket comes back, a broken one is a fresh basket', () => {
  const saved = add(createBasket(), 'M1', 'I1');
  assert.deepEqual(createBasket(JSON.parse(JSON.stringify(saved))), saved);
  for (const junk of [null, 'x', { items: 'no' }, { merchantId: 5, items: {} }]) {
    assert.deepEqual(createBasket(junk), { merchantId: null, items: {}, custom: '' });
  }
});

function fakeFetch(steps) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step instanceof Error) throw step;
    return new Response(JSON.stringify(step.body ?? {}), { status: step.status });
  };
  return { fn, calls };
}
const noSleep = async () => {};

test('requestWithRetry retries 503 and network errors, then succeeds', async () => {
  const { fn, calls } = fakeFetch([new TypeError('Failed to fetch'), { status: 503 }, { status: 200, body: { shops: [] } }]);
  const retries = [];
  const r = await requestWithRetry(fn, '/api/shops', {}, { sleep: noSleep, onRetry: (n) => retries.push(n) });
  assert.deepEqual(r, { ok: true, status: 200, body: { shops: [] } });
  assert.equal(calls.length, 3);
  assert.deepEqual(retries, [1, 2]);
});

test('requestWithRetry does not retry an answer like 409', async () => {
  const { fn, calls } = fakeFetch([{ status: 409, body: { error: 'ITEM_GONE' } }]);
  const r = await requestWithRetry(fn, '/api/orders', {}, { sleep: noSleep });
  assert.deepEqual(r, { ok: false, status: 409, body: { error: 'ITEM_GONE' } });
  assert.equal(calls.length, 1);
});

test('requestWithRetry gives up after its tries with the last failure', async () => {
  const { fn, calls } = fakeFetch([{ status: 502 }]);
  const r = await requestWithRetry(fn, '/api/shops', {}, { tries: 3, sleep: noSleep });
  assert.equal(r.ok, false);
  assert.equal(r.status, 502);
  assert.equal(calls.length, 3);
  const net = await requestWithRetry(fakeFetch([new TypeError('offline')]).fn, '/x', {}, { tries: 2, sleep: noSleep });
  assert.deepEqual(net, { ok: false, status: 0, body: { error: 'NETWORK' } });
});

test('strings: every English key exists in Oromo and Amharic, and every error code has a message', () => {
  const keys = Object.keys(STRINGS.en);
  for (const lang of ['om', 'am']) {
    assert.deepEqual(Object.keys(STRINGS[lang]).sort(), [...keys].sort(), lang);
  }
  for (const code of ERROR_CODES) assert.ok(STRINGS.en[`err_${code}`], code);
  assert.equal(tr('om', 'missing_key_xyz'), 'missing_key_xyz');
  assert.match(tr('en', 'viewBasket', { n: 2, total: '500 Br' }), /2.*500 Br/);
  assert.equal(tr('xx', 'confirmOrder'), STRINGS.en.confirmOrder, 'unknown language falls back to English');
});

test('createApi keeps retrying a sleeping server for about a minute', async () => {
  const { createApi } = await import('../webapp/net.js');
  const { fn, calls } = fakeFetch([{ status: 503 }]);
  let waited = 0;
  const api = createApi({ initData: 'x', fetchFn: fn, sleep: async (ms) => (waited += ms) });
  const r = await api('/api/me');
  assert.equal(r.status, 503);
  assert.ok(waited >= 55000 && waited <= 65000, `waited ${waited} ms over ${calls.length} tries`);
  assert.equal(calls[0].opts.headers.Authorization, 'tma x');
});
