// Admins set item photos and shop banners by sending pictures to the bot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePhotoCaption, pickPhotoSize } from '../src/bot/photos.js';
import { setup, ADMIN, CUSTOMER, STRANGER } from './helpers/botHarness.js';

const SIZES = [
  { file_id: 'S', file_unique_id: 's', width: 320, height: 1 },
  { file_id: 'M', file_unique_id: 'm', width: 800, height: 1 },
  { file_id: 'L', file_unique_id: 'l', width: 1280, height: 1 },
];
const item = async (h, id) => (await h.store.getMenu('M1')).find((i) => i.id === id);
const lastReply = (h, chatId) => {
  const out = h.outTo(chatId).at(-1)?.payload;
  return out?.caption ?? out?.text ?? '';
};

test('parsePhotoCaption reads item and banner captions in any case and spacing', () => {
  assert.deepEqual(parsePhotoCaption('I1'), { kind: 'item', id: 'I1' });
  assert.deepEqual(parsePhotoCaption(' i1 '), { kind: 'item', id: 'I1' });
  assert.deepEqual(parsePhotoCaption('  banner m1 '), { kind: 'banner', id: 'M1' });
  assert.deepEqual(parsePhotoCaption('BANNER   M1'), { kind: 'banner', id: 'M1' });
  for (const bad of [undefined, '', '   ', 'hello world', 'banner', 'I1 I2', 'banner M1 extra', 'I1!']) {
    assert.equal(parsePhotoCaption(bad), null, `caption ${JSON.stringify(bad)}`);
  }
});

test('pickPhotoSize takes the largest within the width, else the smallest', () => {
  const s = [{ file_id: 'a', width: 90 }, { file_id: 'b', width: 320 }, { file_id: 'c', width: 800 }, { file_id: 'd', width: 1280 }];
  assert.equal(pickPhotoSize(s, 800), 'c');
  assert.equal(pickPhotoSize(s, 1280), 'd');
  assert.equal(pickPhotoSize([{ file_id: 'x', width: 2000 }, { file_id: 'y', width: 1500 }], 800), 'y');
});

test('admin photo with caption i1 saves the 800px file id and confirms with the picture', async () => {
  const h = setup();
  await h.send(ADMIN, ADMIN, { photo: SIZES, caption: 'i1' });
  assert.equal((await item(h, 'I1')).photo, 'M');
  const back = h.photosTo(ADMIN).at(-1).payload;
  assert.equal(back.photo, 'M');
  assert.match(back.caption, /✅ Saved: I1 Burger \(Burger House\)/);
});

test('a new photo with the same caption replaces the old one', async () => {
  const h = setup();
  await h.send(ADMIN, ADMIN, { photo: SIZES, caption: 'I1' });
  await h.send(ADMIN, ADMIN, { photo: [{ file_id: 'NEW', file_unique_id: 'n', width: 800, height: 1 }], caption: 'I1' });
  assert.equal((await item(h, 'I1')).photo, 'NEW');
});

test('banner caption saves the 1280px id to the shop', async () => {
  const h = setup();
  await h.send(ADMIN, ADMIN, { photo: SIZES, caption: ' banner m1 ' });
  assert.equal((await h.store.getMerchant('M1')).banner, 'L');
  assert.match(h.photosTo(ADMIN).at(-1).payload.caption, /✅ Saved banner: M1 Burger House/);
});

test('unknown ids, a missing caption and an image sent as a file get plain errors', async () => {
  const h = setup();
  await h.send(ADMIN, ADMIN, { photo: SIZES, caption: 'I9' });
  assert.equal(lastReply(h, ADMIN), '❌ No item I9 in the Menu tab');
  await h.send(ADMIN, ADMIN, { photo: SIZES, caption: 'banner M9' });
  assert.equal(lastReply(h, ADMIN), '❌ No shop M9 in the Merchants tab');
  await h.send(ADMIN, ADMIN, { photo: SIZES });
  assert.equal(lastReply(h, ADMIN), '❌ Please add a caption like I1 or banner M1');
  await h.send(ADMIN, ADMIN, { photo: SIZES, caption: 'my burger' });
  assert.equal(lastReply(h, ADMIN), '❌ Please add a caption like I1 or banner M1');
  await h.send(ADMIN, ADMIN, { document: { file_id: 'D', file_unique_id: 'd', mime_type: 'image/jpeg' }, caption: 'I1' });
  assert.equal(lastReply(h, ADMIN), '❌ Send it as a photo, not a file');
  assert.ok(!(await item(h, 'I1')).photo);
});

test('a customer photo is not saved and gets no admin reply', async () => {
  const h = setup();
  await h.send(CUSTOMER, CUSTOMER, { photo: SIZES, caption: 'I1' });
  assert.ok(!(await item(h, 'I1')).photo);
  assert.equal(h.outTo(CUSTOMER).some((c) => /Saved|❌/.test(c.payload.caption ?? c.payload.text ?? '')), false);
});

test('/photos lists what is missing, only active ones, and is admin-only', async () => {
  const h = setup({
    extraMerchants: [{ id: 'M2', nameEn: 'Pizza Place', active: true }, { id: 'M3', nameEn: 'Closed Shop', active: false }],
    extraMenu: [{ id: 'I5', merchantId: 'M1', nameEn: 'Old item', price: 10, active: false }],
  });
  await h.send(ADMIN, ADMIN, { photo: SIZES, caption: 'I1' });
  await h.text(ADMIN, '/photos');
  const out = lastReply(h, ADMIN);
  assert.match(out, /Shops without a banner: .*M1 Burger House/s);
  assert.match(out, /M2 Pizza Place/);
  assert.match(out, /Items without a photo: .*I2 Chips \(M1\)/s);
  assert.doesNotMatch(out, /I1 Burger|M3|I5/);

  await h.send(ADMIN, ADMIN, { photo: SIZES, caption: 'I2' });
  await h.send(ADMIN, ADMIN, { photo: SIZES, caption: 'banner M1' });
  await h.send(ADMIN, ADMIN, { photo: SIZES, caption: 'banner M2' });
  await h.text(ADMIN, '/photos');
  assert.equal(lastReply(h, ADMIN), '✅ Every shop and item has a picture');

  await h.text(STRANGER, '/photos');
  assert.match(lastReply(h, STRANGER), /not allowed/);
});
