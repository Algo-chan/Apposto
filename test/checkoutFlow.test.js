// One place-order / payment-ref flow for the chat and the mini app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OrderError } from '../src/core/orders.js';
import { setup, CUSTOMER, CUSTOMER2, MERCHANT, GROUP } from './helpers/botHarness.js';

const CHECKOUT = { lat: 7.205, lng: 38.6, distanceKm: 0.7, deliveryFee: 60, landmark: 'Near Abyssinia bank, blue gate', phone: '0911234567' };

async function appOrder(h, { customer = CUSTOMER2, items = { I1: 1 }, custom = null } = {}) {
  return h.checkout.placeAndNotify({
    customer: { id: customer, name: `U${customer}`, lang: 'en' },
    merchant: await h.store.getMerchant('M1'),
    cart: { merchantId: 'M1', items, custom },
    checkout: { ...CHECKOUT },
  });
}

test('placeAndNotify sends the same shop and dispatch messages as a chat order', async () => {
  const h = setup();
  const chatId = await h.placeOrder(CUSTOMER, { items: ['add:I1'] });
  const chatShop = h.lastTo(MERCHANT);
  const chatGroup = h.lastTo(GROUP).text.replace(chatId, 'ID').replace(`U${CUSTOMER}`, 'NAME');

  const order = await appOrder(h);
  await h.tracker.idle();
  assert.equal(order.status, 'PLACED');
  assert.equal(order.foodTotal, 250);
  assert.equal(h.lastTo(MERCHANT).text.replace(order.id, 'ID'), chatShop.text.replace(chatId, 'ID'));
  assert.deepEqual(h.buttons(h.lastTo(MERCHANT)), [`macc:${order.id}`, `mrej:${order.id}`]);
  assert.equal(h.lastTo(GROUP).text.replace(order.id, 'ID').replace(`U${CUSTOMER2}`, 'NAME'), chatGroup);
  // the customer's chat gets the placed headline and the live card, like a chat order
  assert.ok(h.outTo(CUSTOMER2).some((c) => (c.payload.text ?? '').includes(order.id)));
  assert.equal(h.cardsTo(CUSTOMER2).length, 1);
  assert.equal((await h.store.getCustomer(CUSTOMER2)).phone, '0911234567');
});

test('placeAndNotify ignores items that are not on the active menu', async () => {
  const h = setup({ extraMenu: [{ id: 'I5', merchantId: 'M1', nameEn: 'Old', price: 10, active: false }] });
  const order = await appOrder(h, { items: { I1: 2, I5: 1 } });
  assert.equal(order.foodTotal, 500);
});

test('an app-placed order can be paid by typing the ref in the chat', async () => {
  const h = setup();
  const order = await appOrder(h, { customer: CUSTOMER });
  await h.tap(MERCHANT, `macc:${order.id}`);
  await h.text(CUSTOMER, 'CK12AB34CD');
  const o = await h.order(order.id);
  assert.equal(o.status, 'PAYMENT_SUBMITTED');
  assert.equal(o.paymentRef, 'CK12AB34CD');
  assert.deepEqual(h.buttons(h.lastTo(MERCHANT)), [`mpay:${order.id}`, `mnopay:${order.id}`]);
});

test('submitRefAndNotify moves to PAYMENT_SUBMITTED and tells the shop and the group', async () => {
  const h = setup();
  const order = await appOrder(h);
  await h.tap(MERCHANT, `macc:${order.id}`);
  const paid = await h.checkout.submitRefAndNotify({ orderId: order.id, customerId: CUSTOMER2, ref: 'CK12AB34CD' });
  assert.equal(paid.status, 'PAYMENT_SUBMITTED');
  assert.deepEqual(h.buttons(h.lastTo(MERCHANT)), [`mpay:${order.id}`, `mnopay:${order.id}`]);
  assert.match(h.lastTo(GROUP).text, new RegExp(`💳 ${order.id}: customer sent ref CK12AB34CD`));
});

test('submitRefAndNotify rejects a ref already used by another order, and another customer', async () => {
  const h = setup();
  const first = await appOrder(h);
  const second = await appOrder(h);
  await h.tap(MERCHANT, `macc:${first.id}`);
  await h.tap(MERCHANT, `macc:${second.id}`);
  await h.checkout.submitRefAndNotify({ orderId: first.id, customerId: CUSTOMER2, ref: 'CK12AB34CD' });
  await assert.rejects(
    h.checkout.submitRefAndNotify({ orderId: second.id, customerId: CUSTOMER2, ref: 'CK12AB34CD' }),
    (e) => e instanceof OrderError && e.code === 'DUPLICATE_REF'
  );
  await assert.rejects(
    h.checkout.submitRefAndNotify({ orderId: second.id, customerId: CUSTOMER, ref: 'ZZ99XX88' }),
    (e) => e instanceof OrderError && e.code === 'FORBIDDEN'
  );
});
