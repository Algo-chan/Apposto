// Mini app JSON API over the memory store (the HTTP layer and auth are tested in web.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWebApi } from '../src/web/api.js';
import { createMemoryStore } from '../src/storage/memoryStore.js';
import { createOrderService } from '../src/core/orderService.js';
import { createCheckoutFlow } from '../src/bot/checkoutFlow.js';
import { createInsights } from '../src/bot/insights.js';
import { loadConfig } from '../src/config.js';
import { STATUS } from '../src/core/orders.js';

const USER = { id: '100', firstName: 'Abebe', lastName: 'K', languageCode: 'en' };
const OTHER = { id: '200', firstName: 'Other', lastName: '', languageCode: '' };
const NEAR = { lat: 7.205, lng: 38.6 }; // ~0.7 km road distance from M1
const FAR = { lat: 7.25, lng: 38.6 };

function setup() {
  const origWarn = console.warn;
  console.warn = () => {};
  const { config } = loadConfig({ BOT_TOKEN: '1:test', STORAGE: 'memory' });
  console.warn = origWarn;
  const store = createMemoryStore({
    merchants: [
      {
        id: 'M1', nameEn: 'Burger House', nameOm: 'Mana Baargarii', nameAm: 'በርገር ቤት', telegramId: '300', phone: '0911111111',
        lang: 'en', telebirr: '0911111111', cbeAccount: '1000123', accountName: 'Abebe K', lat: 7.2, lng: 38.6, active: true, banner: 'BANNER_1234567',
      },
      { id: 'M2', nameEn: 'Closed Shop', active: false },
    ],
    menu: [
      { id: 'I1', merchantId: 'M1', nameEn: 'Burger', price: 250, active: true, photo: 'PHOTO_1234567' },
      { id: 'I2', merchantId: 'M1', nameEn: 'Chips', price: 120, active: true },
      { id: 'I3', merchantId: 'M1', nameEn: 'Old', price: 50, active: false },
    ],
  });
  const service = createOrderService({ store, config });
  const sent = [];
  const notify = {
    toMerchant: async (m, key) => sent.push({ to: 'shop', key }),
    dispatch: async (text) => sent.push({ to: 'group', text }),
  };
  const tracker = { update: () => Promise.resolve() };
  const checkout = createCheckoutFlow({ store, service, notify, tracker });
  const insights = createInsights({ store, config });
  const api = createWebApi({ store, config, insights, checkout });
  const call = (method, path, body, user = USER) => api.handle(method, path, { user, body });
  let n = 0;
  const orderBody = (over = {}) => ({
    requestId: `req-${String(++n).padStart(8, '0')}`,
    merchantId: 'M1', items: { I1: 1 }, custom: '', ...NEAR, landmark: 'Near the blue gate', phone: '0911234567', ...over,
  });
  return { store, service, api, call, sent, orderBody, config };
}

test('shops list only active shops, with names, prep time and a banner url', async () => {
  const { call } = setup();
  const r = await call('GET', '/api/shops');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.shops.map((s) => s.id), ['M1']);
  const [m1] = r.body.shops;
  assert.equal(m1.names.en, 'Burger House');
  assert.equal(m1.names.om, 'Mana Baargarii');
  assert.equal(m1.banner, '/img/BANNER_1234567');
  assert.equal(m1.prepMin, 20);
});

test('menu lists only active items, with photo urls or null', async () => {
  const { call } = setup();
  const r = await call('GET', '/api/shops/M1/menu');
  assert.equal(r.status, 200);
  assert.equal(r.body.shop.id, 'M1');
  assert.deepEqual(r.body.items.map((i) => [i.id, i.price, i.photo]), [['I1', 250, '/img/PHOTO_1234567'], ['I2', 120, null]]);
});

test('menu of an inactive or unknown shop is SHOP_CLOSED', async () => {
  const { call } = setup();
  for (const id of ['M2', 'M9']) {
    const r = await call('GET', `/api/shops/${id}/menu`);
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'SHOP_CLOSED');
  }
});

test('quote: near gives the base fee, far is out of range, no location gives the base fee', async () => {
  const { call } = setup();
  const near = await call('POST', '/api/quote', { merchantId: 'M1', ...NEAR });
  assert.equal(near.status, 200);
  assert.equal(near.body.deliveryFee, 60);
  assert.equal(near.body.serviceFee, 10);
  assert.equal(near.body.outOfRange, false);
  assert.ok(near.body.distanceKm > 0 && near.body.distanceKm < 1.5);
  assert.ok(near.body.eta.min >= 15 && near.body.eta.max === near.body.eta.min + 10);
  const far = await call('POST', '/api/quote', { merchantId: 'M1', ...FAR });
  assert.equal(far.body.outOfRange, true);
  const none = await call('POST', '/api/quote', { merchantId: 'M1' });
  assert.equal(none.body.deliveryFee, 60);
  assert.equal(none.body.distanceKm, null);
});

test('order totals come from the sheet, never from the request', async () => {
  const { call, store, sent, orderBody } = setup();
  const r = await call('POST', '/api/orders', { ...orderBody(), price: 1, foodTotal: 1, deliveryFee: 0, items: { I1: 2 } });
  assert.equal(r.status, 200);
  const o = await store.getOrder(r.body.orderId);
  assert.equal(o.foodTotal, 500);
  assert.equal(o.deliveryFee, 60);
  assert.equal(o.customerId, '100');
  assert.equal(o.customerName, 'Abebe K');
  assert.equal(o.customerPhone, '0911234567');
  assert.equal(o.landmark, 'Near the blue gate');
  assert.deepEqual(sent.map((s) => s.to), ['shop', 'group']);
});

test('a price changed after browsing: the order uses the current price', async () => {
  const { call, store, orderBody } = setup();
  store._db.menu.find((i) => i.id === 'I1').price = 300;
  const r = await call('POST', '/api/orders', orderBody());
  assert.equal((await store.getOrder(r.body.orderId)).foodTotal, 300);
});

test('order errors: turned-off item, empty, bad phone, short landmark, far, closed shop', async () => {
  const { call, orderBody, store } = setup();
  const cases = [
    [{ items: { I3: 1 } }, 409, 'ITEM_GONE'],
    [{ items: { I1: 1, NOPE: 1 } }, 409, 'ITEM_GONE'],
    [{ items: {} }, 400, 'EMPTY'],
    [{ phone: '12' }, 400, 'BAD_PHONE'],
    [{ landmark: 'ab' }, 400, 'BAD_LANDMARK'],
    [FAR, 409, 'OUT_OF_RANGE'],
    [{ merchantId: 'M2' }, 409, 'SHOP_CLOSED'],
    [{ requestId: 'x' }, 400, 'BAD_REQUEST'],
    [{ items: 'I1' }, 400, 'BAD_REQUEST'],
  ];
  for (const [over, status, error] of cases) {
    const r = await call('POST', '/api/orders', orderBody(over));
    assert.deepEqual([r.status, r.body.error], [status, error], JSON.stringify(over));
  }
  assert.equal((await store.listOrders()).length, 0);
});

test('a special request alone is a valid order, and quantities are clamped to 20', async () => {
  const { call, orderBody, store } = setup();
  const custom = await call('POST', '/api/orders', orderBody({ items: {}, custom: '  2 cold sodas  ' }));
  const o = await store.getOrder(custom.body.orderId);
  assert.equal(o.customRequest, '2 cold sodas');
  assert.equal(o.foodTotal, null);
  const many = await call('POST', '/api/orders', orderBody({ items: { I2: 99 } }));
  assert.equal((await store.getOrder(many.body.orderId)).foodTotal, 20 * 120);
});

test('the same requestId twice in a row gives one order', async () => {
  const { call, orderBody, store } = setup();
  const body = orderBody();
  const a = await call('POST', '/api/orders', body);
  const b = await call('POST', '/api/orders', body);
  assert.equal(a.body.orderId, b.body.orderId);
  assert.equal((await store.listOrders()).length, 1);
});

test('the same requestId twice at the same time gives one order', async () => {
  const { call, orderBody, store } = setup();
  const body = orderBody();
  const [a, b] = await Promise.all([call('POST', '/api/orders', body), call('POST', '/api/orders', body)]);
  assert.equal(a.body.orderId, b.body.orderId);
  assert.equal((await store.listOrders()).length, 1);
});

test('one requestId from two customers gives two orders', async () => {
  const { call, orderBody, store } = setup();
  const body = orderBody();
  await call('POST', '/api/orders', body);
  await call('POST', '/api/orders', body, OTHER);
  assert.equal((await store.listOrders()).length, 2);
});

test('order status: pay details only once accepted; another customer gets NOT_FOUND', async () => {
  const { call, orderBody, service } = setup();
  const { orderId } = (await call('POST', '/api/orders', orderBody({ items: { I1: 1, I2: 2 } }))).body;
  let r = await call('GET', `/api/orders/${orderId}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'PLACED');
  assert.equal(r.body.pay, null);
  assert.equal(r.body.shopName, 'Burger House');
  assert.deepEqual(r.body.lines, [{ name: 'Burger', qty: 1, subtotal: 250 }, { name: 'Chips', qty: 2, subtotal: 240 }]);
  assert.equal(r.body.foodTotal, 490);

  await service.accept(orderId, 'M1', null);
  r = await call('GET', `/api/orders/${orderId}`);
  assert.deepEqual(r.body.pay, { amount: 490, telebirr: '0911111111', cbeAccount: '1000123', accountName: 'Abebe K', phone: '0911111111' });
  assert.equal(r.body.rider, null);

  const other = await call('GET', `/api/orders/${orderId}`, undefined, OTHER);
  assert.deepEqual([other.status, other.body.error], [404, 'NOT_FOUND']);
  const missing = await call('GET', '/api/orders/261110-ZZZZ');
  assert.equal(missing.status, 404);
});

test('payment ref: moves to PAYMENT_SUBMITTED; bad ref; used ref; too early', async () => {
  const { call, orderBody, service, sent } = setup();
  const a = (await call('POST', '/api/orders', orderBody())).body.orderId;
  const b = (await call('POST', '/api/orders', orderBody())).body.orderId;
  const early = await call('POST', `/api/orders/${a}/ref`, { ref: 'CK12AB34CD' });
  assert.deepEqual([early.status, early.body.error], [409, 'BAD_TRANSITION']);
  await service.accept(a, 'M1', null);
  await service.accept(b, 'M1', null);
  const bad = await call('POST', `/api/orders/${a}/ref`, { ref: 'hello' });
  assert.deepEqual([bad.status, bad.body.error], [400, 'BAD_REF']);
  const ok = await call('POST', `/api/orders/${a}/ref`, { ref: 'ck12 ab34 cd' });
  assert.deepEqual([ok.status, ok.body.status], [200, STATUS.PAYMENT_SUBMITTED]);
  assert.ok(sent.some((s) => s.key === 'mCheckPayment'));
  const dup = await call('POST', `/api/orders/${b}/ref`, { ref: 'CK12AB34CD' });
  assert.deepEqual([dup.status, dup.body.error], [409, 'DUPLICATE_REF']);
  const notMine = await call('POST', `/api/orders/${b}/ref`, { ref: 'ZZ99XX88' }, OTHER);
  assert.deepEqual([notMine.status, notMine.body.error], [404, 'NOT_FOUND']);
});

test('me: language, saved phone and the open order', async () => {
  const { call, orderBody, store } = setup();
  let me = await call('GET', '/api/me');
  assert.deepEqual(me.body, { lang: null, phone: '', openOrderId: null });
  assert.deepEqual((await call('POST', '/api/lang', { lang: 'om' })).body, { ok: true });
  assert.equal((await call('POST', '/api/lang', { lang: 'xx' })).body.error, 'BAD_REQUEST');
  const { orderId } = (await call('POST', '/api/orders', orderBody())).body;
  me = await call('GET', '/api/me');
  assert.deepEqual(me.body, { lang: 'om', phone: '0911234567', openOrderId: orderId });
  assert.equal((await store.getCustomer('100')).lang, 'om');
});

test('an app order is placed in the customer\'s saved language', async () => {
  const { call, orderBody, store } = setup();
  await call('POST', '/api/lang', { lang: 'am' });
  const { orderId } = (await call('POST', '/api/orders', orderBody())).body;
  assert.equal((await store.getOrder(orderId)).customerLang, 'am');
});

test('unknown routes are NOT_FOUND and unexpected errors are ERROR', async () => {
  const { call, store } = setup();
  assert.deepEqual([(await call('GET', '/api/nope')).status, (await call('DELETE', '/api/shops')).status], [404, 404]);
  store.getMerchants = async () => { throw new Error('sheet down'); };
  const origError = console.error;
  console.error = () => {};
  try {
    const r = await call('GET', '/api/shops');
    assert.deepEqual([r.status, r.body.error], [500, 'ERROR']);
  } finally {
    console.error = origError;
  }
});

test('a badly encoded id is NOT_FOUND, not a server error', async () => {
  const { call } = setup();
  const r = await call('GET', '/api/orders/%E0%A4%A');
  assert.deepEqual([r.status, r.body.error], [404, 'NOT_FOUND']);
});
