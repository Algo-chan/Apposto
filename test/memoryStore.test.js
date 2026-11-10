import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/memoryStore.js';

const seed = () => ({
  merchants: [{ id: 'M1', nameEn: 'Burger House', active: true }],
  menu: [{ id: 'I1', merchantId: 'M1', nameEn: 'Burger', price: 250, active: true }],
});

test('memory setMenuPhoto saves the photo, matching the id in any case', async () => {
  const store = createMemoryStore(seed());
  const item = await store.setMenuPhoto('i1', 'FILE1');
  assert.equal(item.id, 'I1');
  assert.equal(item.names.en, 'Burger');
  assert.equal((await store.getMenu('M1'))[0].photo, 'FILE1');
  assert.equal(await store.setMenuPhoto('I9', 'X'), null);
});

test('memory setMerchantBanner saves the banner, matching the id in any case', async () => {
  const store = createMemoryStore(seed());
  const m = await store.setMerchantBanner('m1', 'BAN1');
  assert.equal(m.id, 'M1');
  assert.equal((await store.getMerchant('M1')).banner, 'BAN1');
  assert.equal(await store.setMerchantBanner('M9', 'X'), null);
});
