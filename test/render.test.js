import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bannerSvg, trackerSvg, renderPng } from '../src/render/cards.js';
import { createImageCache } from '../src/render/imageCache.js';
import { createNotifier } from '../src/bot/notify.js';
import { InputFile } from 'grammy';

const SIG = [0x89, 0x50, 0x4e, 0x47];
const texts = {
  en: { slogan: 'Order. Relax.', tagline: 'Food and more, delivered by bicycle.', cta: 'Order now' },
  om: { slogan: 'Ajaji. Boqonnaa fudhadhu.', tagline: 'Nyaata fi kkf, biskiliitiin.', cta: 'Amma ajaji' },
  am: { slogan: 'ይዘዙ። ዘና ይበሉ።', tagline: 'ምግብና ሌሎችም በብስክሌት።', cta: 'አሁን ይዘዙ' },
};

for (const [lang, args] of Object.entries(texts)) {
  test(`banner renders a small PNG (${lang})`, async () => {
    const png = await renderPng(bannerSvg(args));
    assert.deepEqual([...png.subarray(0, 4)], SIG);
    assert.ok(png.length < 120000, `size ${png.length}`);
  });
}

test('trackerSvg escapes text and colours bars by stage', async () => {
  const labels = ['a', 'b', 'c', 'd', 'e', 'f'];
  const svg = trackerSvg({ title: 'A & B', eta: '20–30 min', stage: 4, labels });
  assert.ok(svg.includes('A &amp; B'));
  const count = (c) => (svg.match(new RegExp(`<rect[^>]*data-bar="1"[^>]*fill="${c}"`, 'g')) || []).length;
  assert.equal(count('#4BE3A4'), 3);
  assert.equal(count('#FFC72C'), 1);
  assert.equal(count('#25564A'), 2);
  assert.deepEqual([...(await renderPng(svg)).subarray(0, 4)], SIG);
});

test('cache memoizes by key', async () => {
  let n = 0;
  const c = createImageCache({ render: () => (n++, Buffer.from('x')), log: () => {} });
  await c.png('k', {});
  await c.png('k', {});
  assert.equal(n, 1);
});

test('cache renders one at a time', async () => {
  let cur = 0, max = 0;
  const render = async () => {
    cur++; max = Math.max(max, cur);
    await new Promise((r) => setTimeout(r, 10));
    cur--;
    return Buffer.from('x');
  };
  const c = createImageCache({ render, log: () => {} });
  await Promise.all([c.png('a', {}), c.png('b', {}), c.png('c', {})]);
  assert.equal(max, 1);
});

test('cache: throwing render gives null and one log line', async () => {
  const logs = [];
  const c = createImageCache({ render: () => { throw new Error('boom'); }, log: (m) => logs.push(m) });
  assert.equal(await c.png('k', {}), null);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /render failed k: boom/);
});

test('cache: slow render times out to null', async () => {
  const logs = [];
  const render = () => new Promise((r) => setTimeout(() => r(Buffer.from('x')), 300));
  const c = createImageCache({ render, timeoutMs: 50, log: (m) => logs.push(m) });
  assert.equal(await c.png('k', {}), null);
  assert.equal(logs.length, 1);
});

test('sendPhotoCached uploads once then reuses file_id', async () => {
  const sent = [];
  const api = {
    sendPhoto: async (chat, photo, other) => {
      sent.push(photo);
      return { photo: [{ file_id: 'small' }, { file_id: 'big' }] };
    },
  };
  const images = createImageCache({ render: () => Buffer.from('png'), log: () => {} });
  const n = createNotifier({ api, store: {}, config: {}, images });
  const r1 = await n.sendPhotoCached(1, 'k', {}, {});
  assert.ok(r1);
  assert.ok(sent[0] instanceof InputFile);
  await n.sendPhotoCached(2, 'k', {}, {});
  assert.equal(sent[1], 'big');
});

test('sendPhotoCached returns null with no image or on send failure', async () => {
  const api = { sendPhoto: async () => { throw new Error('nope'); } };
  const none = createNotifier({ api, store: {}, config: {} });
  assert.equal(await none.sendPhotoCached(1, 'k', {}, {}), null);
  const images = createImageCache({ render: () => null, log: () => {} });
  assert.equal(await createNotifier({ api, store: {}, config: {}, images }).sendPhotoCached(1, 'k', {}, {}), null);
  const images2 = createImageCache({ render: () => Buffer.from('p'), log: () => {} });
  const origErr = console.error; console.error = () => {};
  try {
    assert.equal(await createNotifier({ api, store: {}, config: {}, images: images2 }).sendPhotoCached(1, 'k', {}, {}), null);
  } finally { console.error = origErr; }
});

test('renderPng does not block the event loop', async () => {
  let ticks = 0;
  const timer = setInterval(() => ticks++, 1);
  try {
    const svg = bannerSvg(texts.en);
    // several renders in flight: ticks must keep firing while the worker threads are busy
    await Promise.all([renderPng(svg), renderPng(svg), renderPng(svg)]);
  } finally {
    clearInterval(timer);
  }
  assert.ok(ticks > 0, 'timer never fired during render');
});
