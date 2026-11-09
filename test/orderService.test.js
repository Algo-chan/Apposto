// Order service rules that need locking across parallel chats.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOrderService } from '../src/core/orderService.js';
import { createMemoryStore } from '../src/storage/memoryStore.js';

test('the same payment reference sent by two customers at once is accepted only once', async () => {
  const store = createMemoryStore();
  for (const [id, customerId] of [['261109-AAAA', '101'], ['261109-BBBB', '102']]) {
    await store.createOrder({ id, customerId, status: 'ACCEPTED', paymentRef: '' });
  }
  const service = createOrderService({ store, config: {} });
  const results = await Promise.allSettled([
    service.submitPayment('261109-AAAA', '101', 'FT12345678'),
    service.submitPayment('261109-BBBB', '102', 'FT12345678'),
  ]);
  const ok = results.filter((r) => r.status === 'fulfilled');
  const failed = results.filter((r) => r.status === 'rejected');
  assert.equal(ok.length, 1);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].reason.code, 'DUPLICATE_REF');
  const withRef = (await store.listOrders()).filter((o) => o.paymentRef === 'FT12345678');
  assert.equal(withRef.length, 1);
});

test('placing an order checks the new id without re-reading the sheet', async () => {
  const store = createMemoryStore();
  const seen = [];
  const getOrder = store.getOrder;
  store.getOrder = (id, opts) => { seen.push(opts); return getOrder(id, opts); };
  const service = createOrderService({ store, config: { serviceFee: 10, defaultCommissionPct: 8 } });
  await service.placeOrder({
    customer: { id: 100, name: 'C', lang: 'en' },
    merchant: { id: 'M1', names: { en: 'Shop' }, commissionPct: 8 },
    summary: { lines: [{ itemId: 'I1', nameEn: 'Burger', qty: 1, price: 250 }], total: 250, custom: null },
    checkout: { phone: '0911234567', landmark: 'near bank', deliveryFee: 40, distanceKm: 1 },
  });
  assert.ok(seen.length >= 1);
  assert.ok(seen.every((o) => o?.refresh === false));
});
