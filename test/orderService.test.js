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
