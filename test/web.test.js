// HTTP side: router, photo proxy (and later the mini app's static files and API).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createPhotoProxy } from '../src/web/photoProxy.js';
import { createHttpHandler } from '../src/web/httpHandler.js';
import { createHealthHandler } from '../src/runtime.js';
import { createMemoryStore } from '../src/storage/memoryStore.js';

const PHOTO = 'FILEID_1234567';
const BANNER = 'BANNER_1234567';

function photoSetup({ maxBytes, bodies = {} } = {}) {
  const store = createMemoryStore({
    merchants: [{ id: 'M1', nameEn: 'Shop', active: true, banner: BANNER }],
    menu: [
      { id: 'I1', merchantId: 'M1', nameEn: 'Burger', price: 250, active: true, photo: PHOTO },
      { id: 'I2', merchantId: 'M1', nameEn: 'Chips', price: 120, active: true, photo: 'SECOND_1234567' },
    ],
  });
  const counts = { getFile: 0, fetch: 0 };
  const api = {
    async getFile(fileId) {
      counts.getFile++;
      return { file_id: fileId, file_path: fileId === BANNER ? `photos/${fileId}.png` : `photos/${fileId}.jpg` };
    },
  };
  const fetchFn = async (url) => {
    counts.fetch++;
    counts.lastUrl = url;
    const id = url.split('/').at(-1).split('.')[0];
    const body = bodies[id] ?? Buffer.from(`img:${id}`);
    await new Promise((r) => setTimeout(r, 5));
    return new Response(body, { status: 200 });
  };
  const photos = createPhotoProxy({ api, botToken: '1:test', store, fetchFn, ...(maxBytes ? { maxBytes } : {}) });
  return { store, photos, counts };
}

test('photo proxy downloads a known photo once and then serves it from memory', async () => {
  const { photos, counts } = photoSetup();
  const a = await photos.get(PHOTO);
  const b = await photos.get(PHOTO);
  assert.equal(a.body.toString(), `img:${PHOTO}`);
  assert.equal(a.type, 'image/jpeg');
  assert.equal(b.body.toString(), `img:${PHOTO}`);
  assert.equal(counts.fetch, 1);
  assert.equal(counts.lastUrl, `https://api.telegram.org/file/bot1:test/photos/${PHOTO}.jpg`);
  assert.equal((await photos.get(BANNER)).type, 'image/png');
});

test('photo proxy refuses ids that are not a current photo or banner', async () => {
  const { photos, counts } = photoSetup();
  assert.equal(await photos.get('OTHER_FILE_99'), null);
  assert.equal(counts.getFile, 0);
});

test('photo proxy shares one download between two requests at once', async () => {
  const { photos, counts } = photoSetup();
  const [a, b] = await Promise.all([photos.get(PHOTO), photos.get(PHOTO)]);
  assert.equal(a.body.toString(), b.body.toString());
  assert.equal(counts.fetch, 1);
});

test('photo proxy evicts the oldest photo when over its byte limit', async () => {
  const { photos, counts } = photoSetup({ maxBytes: 10, bodies: { [PHOTO]: Buffer.alloc(6), SECOND_1234567: Buffer.alloc(6) } });
  await photos.get(PHOTO);
  await photos.get('SECOND_1234567');
  await photos.get(PHOTO); // evicted: fetched again
  assert.equal(counts.fetch, 3);
});

test('photo proxy returns null when Telegram fails', async () => {
  const { store } = photoSetup();
  const origError = console.error;
  console.error = () => {};
  try {
    const photos = createPhotoProxy({ api: { getFile: async () => { throw new Error('boom'); } }, botToken: '1:t', store, fetchFn: fetch });
    assert.equal(await photos.get(PHOTO), null);
  } finally {
    console.error = origError;
  }
});

async function serve(handler) {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

test('http handler: health, a cached photo with its headers, bad and unknown ids, other paths', async () => {
  const { photos } = photoSetup();
  const handler = createHttpHandler({ health: createHealthHandler({ isRunning: () => true }), photos });
  const { base, close } = await serve(handler);
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    const img = await fetch(`${base}/img/${PHOTO}`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/jpeg');
    assert.equal(img.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(Buffer.from(await img.arrayBuffer()).toString(), `img:${PHOTO}`);
    assert.equal((await fetch(`${base}/img/OTHER_FILE_99`)).status, 404);
    assert.equal((await fetch(`${base}/img/bad`)).status, 404); // too short to be a file id
    assert.equal((await fetch(`${base}/img/..%2F..%2Fsecret_file`)).status, 404);
    assert.equal((await fetch(`${base}/api/shops`)).status, 404); // no API yet
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  } finally {
    await close();
  }
});
