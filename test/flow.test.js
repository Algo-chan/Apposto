// End-to-end: the real bot code, a fake Telegram API, in-memory storage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBot } from '../src/bot/createBot.js';
import { createMemoryStore } from '../src/storage/memoryStore.js';
import { loadConfig } from '../src/config.js';
import { t } from '../src/i18n.js';
import path from 'node:path';
import { createImageCache } from '../src/render/imageCache.js';

const BOT = { id: 999999, is_bot: true, first_name: 'Bot', username: 'test_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false };
const CUSTOMER = 100, MERCHANT = 200, RIDER = 300, RIDER2 = 301, ADMIN = 500, STRANGER = 666, GROUP = -1001;

/** realImages: render real PNG cards (slower); default is a tiny fake picture. */
function setup({ failPhoto = false, realImages = false, accountName = 'Abebe K' } = {}) {
  const origWarn = console.warn;
  console.warn = () => {};
  const { config } = loadConfig({
    BOT_TOKEN: '1:test', STORAGE: 'memory', DISPATCH_CHAT_ID: String(GROUP), ADMIN_IDS: String(ADMIN), SUPPORT_PHONE: '0911000000',
  });
  console.warn = origWarn;
  const store = createMemoryStore({
    merchants: [{
      id: 'M1', nameEn: 'Burger House', nameOm: 'Mana Baargarii', nameAm: 'በርገር ቤት', telegramId: String(MERCHANT),
      phone: '0911111111', lang: 'om', telebirr: '0911111111', cbeAccount: '1000123', accountName,
      commissionPct: 8, lat: 7.2, lng: 38.6, active: true,
    }],
    menu: [
      { id: 'I1', merchantId: 'M1', nameEn: 'Burger', nameOm: 'Baargarii', nameAm: 'በርገር', price: 250, active: true },
      { id: 'I2', merchantId: 'M1', nameEn: 'Chips', nameOm: 'Chiipsii', nameAm: 'ችፕስ', price: 120, active: true },
    ],
    riders: [
      { telegramId: String(RIDER), name: 'Kebede', phone: '0922222222', lang: 'am', active: true },
      { telegramId: String(RIDER2), name: 'Lensa', phone: '0933333333', lang: 'om', active: true },
    ],
  });
  const images = realImages ? undefined : createImageCache({ render: () => Buffer.from('png') });
  const { bot } = createBot({ config, store, botInfo: BOT, images, warmImages: false });
  const calls = [];
  const blocked = new Set(); // chat ids that never pressed Start
  let mid = 5000;
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload });
    if (method === 'sendMessage' && blocked.has(String(payload.chat_id))) {
      return { ok: false, error_code: 403, description: "Forbidden: bot can't initiate conversation with a user" };
    }
    if (method === 'sendPhoto') {
      if (failPhoto) return { ok: false, error_code: 400, description: 'Bad Request: IMAGE_PROCESS_FAILED' };
      const photo = [{ file_id: `F${mid}`, file_unique_id: `U${mid}`, width: 960, height: 480 }];
      return { ok: true, result: { message_id: mid++, date: 0, chat: { id: payload.chat_id, type: 'private' }, photo, caption: payload.caption } };
    }
    if (method.startsWith('send') || method === 'editMessageText') {
      return { ok: true, result: { message_id: mid++, date: 0, chat: { id: payload.chat_id, type: 'private' }, text: payload.text } };
    }
    return { ok: true, result: true };
  });

  let uid = 1;
  const user = (id) => ({ id, is_bot: false, first_name: `U${id}` });
  const chatOf = (id) => (id < 0 ? { id, type: 'supergroup', title: 'Dispatch' } : { id, type: 'private', first_name: `U${id}` });
  async function send(from, chatId, fields) {
    const message = { message_id: uid, date: 0, chat: chatOf(chatId), from: user(from), ...fields };
    if (typeof fields.text === 'string' && fields.text.startsWith('/')) {
      message.entities = [{ type: 'bot_command', offset: 0, length: fields.text.split(' ')[0].length }];
    }
    await bot.handleUpdate({ update_id: uid++, message });
  }
  const text = (from, t, chatId = from) => send(from, chatId, { text: t });
  async function tap(from, data, chatId = from, messageText = 'msg') {
    await bot.handleUpdate({
      update_id: uid++,
      callback_query: { id: String(uid), from: user(from), chat_instance: 'x', data, message: { message_id: 1, date: 0, chat: chatOf(chatId), from: BOT, text: messageText } },
    });
  }
  const sentTo = (chatId) => calls.filter((c) => c.method === 'sendMessage' && String(c.payload.chat_id) === String(chatId));
  const lastTo = (chatId) => sentTo(chatId).at(-1)?.payload;
  const photosTo = (chatId) => calls.filter((c) => c.method === 'sendPhoto' && String(c.payload.chat_id) === String(chatId));
  /** sendMessage / sendPhoto calls to a chat, from call number `from` on. */
  const outTo = (chatId, from = 0) =>
    calls.slice(from).filter((c) => ['sendMessage', 'sendPhoto'].includes(c.method) && String(c.payload.chat_id) === String(chatId));
  const lastAlert = () => calls.filter((c) => c.method === 'answerCallbackQuery').at(-1)?.payload;
  const buttons = (payload) => (payload?.reply_markup?.inline_keyboard || []).flat().map((b) => b.callback_data);
  const lastEdit = () => calls.filter((c) => c.method === 'editMessageText').at(-1)?.payload;
  const order = async (id) => store.getOrder(id);
  const latestOrder = async () => (await store.listOrders()).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || 0).at(-1);

  async function placeOrder(cust, { items = ['add:I1'], custom = null, location = { latitude: 7.205, longitude: 38.6 }, phone = '+251911234567' } = {}) {
    await text(cust, '/start');
    if (calls.length && buttons(lastTo(cust)).includes('lang:en')) await tap(cust, 'lang:en');
    await text(cust, '🛍 Order');
    await tap(cust, 'm:M1');
    for (const it of items) await tap(cust, it);
    if (custom) {
      await tap(cust, 'custom');
      await text(cust, custom);
    }
    await tap(cust, 'checkout');
    if (location) await send(cust, cust, { location });
    else await text(cust, '⏭ Skip');
    await text(cust, 'Near Abyssinia bank, blue gate');
    await send(cust, cust, { contact: { phone_number: phone, first_name: 'C' } });
    await tap(cust, 'confirm');
    const all = await store.listOrders({ customerId: cust });
    return all.at(-1).id;
  }

  return { bot, store, calls, blocked, text, send, tap, sentTo, photosTo, outTo, lastTo, lastAlert, buttons, lastEdit, order, latestOrder, placeOrder, config };
}

test('happy path: order -> accept -> pay -> confirm -> rider -> delivered, with attack attempts', async () => {
  const h = setup();

  // language picker on first start
  await h.text(CUSTOMER, '/start');
  assert.deepEqual(h.buttons(h.lastTo(CUSTOMER)), ['lang:om', 'lang:am', 'lang:en']);

  const id = await h.placeOrder(CUSTOMER, { items: ['add:I1', 'add:I1', 'add:I2'] });
  let o = await h.order(id);
  assert.equal(o.status, 'PLACED');
  assert.equal(o.foodTotal, 620); // 2x250 + 120
  assert.equal(o.deliveryFee, 60); // ~0.7 km
  assert.equal(o.customerPhone, '0911234567');
  assert.equal(o.landmark, 'Near Abyssinia bank, blue gate');

  // shop got the order IN AFAAN OROMO with accept/reject
  const toShop = h.lastTo(MERCHANT);
  assert.match(toShop.text, /Ajaja haaraa/);
  assert.deepEqual(h.buttons(toShop), [`macc:${id}`, `mrej:${id}`]);
  assert.match(h.sentTo(GROUP).at(-1).payload.text, /🆕/);

  // ATTACK: a stranger presses the shop's Accept button
  await h.tap(STRANGER, `macc:${id}`);
  assert.match(h.lastAlert().text, /not allowed/);
  assert.equal((await h.order(id)).status, 'PLACED');

  // shop accepts -> customer gets payment instructions with shop accounts
  await h.tap(MERCHANT, `macc:${id}`);
  o = await h.order(id);
  assert.equal(o.status, 'ACCEPTED');
  assert.equal(o.commission, 50); // 8% of 620 = 49.6
  const payMsg = h.lastTo(CUSTOMER).text;
  assert.match(payMsg, /Send 620 Br to the shop/);
  assert.match(payMsg, /Telebirr: <code>0911111111<\/code>/);
  assert.match(payMsg, /70 Br cash/); // 60 delivery + 10 service

  // shop presses Accept twice -> no double processing
  await h.tap(MERCHANT, `macc:${id}`);
  assert.match(h.lastAlert().text, /duraan haaromfameera/); // shop's own language

  // customer sends junk, then a real reference
  await h.text(CUSTOMER, 'hello');
  assert.match(h.lastTo(CUSTOMER).text, /reference number/);
  await h.text(CUSTOMER, 'ck12 ab34 cd');
  o = await h.order(id);
  assert.equal(o.status, 'PAYMENT_SUBMITTED');
  assert.equal(o.paymentRef, 'CK12AB34CD');
  assert.deepEqual(h.buttons(h.lastTo(MERCHANT)), [`mpay:${id}`, `mnopay:${id}`]);

  // shop says money NOT received -> customer must resend
  await h.tap(MERCHANT, `mnopay:${id}`);
  o = await h.order(id);
  assert.equal(o.status, 'ACCEPTED');
  assert.equal(o.paymentRef, '');
  assert.match(h.lastTo(CUSTOMER).text, /could not find your payment/);
  assert.match(h.sentTo(GROUP).at(-1).payload.text, /NOT received/);

  await h.text(CUSTOMER, 'CK12AB34CD');
  await h.tap(MERCHANT, `mpay:${id}`);
  assert.equal((await h.order(id)).status, 'CONFIRMED');
  assert.match(h.lastTo(CUSTOMER).text, /Payment confirmed/);
  const job = h.sentTo(GROUP).at(-1).payload;
  assert.match(job.text, /New delivery/);
  assert.deepEqual(h.buttons(job), [`take:${id}`]);

  // ATTACK: random group member tries to take the job
  await h.tap(STRANGER, `take:${id}`, GROUP);
  assert.match(h.lastAlert().text, /registered riders/);

  // two riders tap at the same moment: exactly one wins
  await Promise.all([h.tap(RIDER, `take:${id}`, GROUP), h.tap(RIDER2, `take:${id}`, GROUP)]);
  o = await h.order(id);
  assert.ok([String(RIDER), String(RIDER2)].includes(o.riderId));
  const winner = Number(o.riderId);
  const loser = winner === RIDER ? RIDER2 : RIDER;
  assert.equal(h.sentTo(loser).length, 0, 'loser must not receive the job');
  assert.equal(o.riderPay, 45);
  assert.ok(h.calls.some((c) => c.method === 'sendLocation' && c.payload.chat_id === String(winner)));
  assert.match(h.lastTo(CUSTOMER).text, /will deliver order/);

  // shop marks ready -> rider notified
  await h.tap(MERCHANT, `mready:${id}`);
  assert.equal((await h.order(id)).status, 'READY');

  // ATTACK: the other rider tries to mark it picked up
  await h.tap(loser, `rpick:${id}`);
  assert.match(h.lastAlert().text, /⛔/);
  assert.equal((await h.order(id)).status, 'READY');

  await h.tap(winner, `rpick:${id}`);
  assert.equal((await h.order(id)).status, 'PICKED_UP');
  assert.deepEqual(h.buttons(h.lastEdit()), [`rdone:${id}`]);
  await h.tap(winner, `rdone:${id}`);
  o = await h.order(id);
  assert.equal(o.status, 'DELIVERED');
  assert.ok(o.deliveredAt);
  assert.ok(h.sentTo(CUSTOMER).some((c) => /Order .* delivered/.test(c.payload.text)));
  assert.deepEqual(h.buttons(h.lastTo(CUSTOMER)), [1, 2, 3, 4, 5].map((n) => `rf:${id}:${n}`));
  // you keep: 50 commission + 10 service + 60 delivery - 45 rider = 75
  assert.match(h.sentTo(GROUP).at(-1).payload.text, /you earned 75 Br/);

  // admin report
  await h.text(ADMIN, '/today', GROUP);
  assert.match(h.lastTo(GROUP).text, /You earned: 75 Br/);
  // non-admin can't see it
  await h.text(STRANGER, '/today', GROUP);
  assert.match(h.lastTo(GROUP).text, /not allowed/);
});

test('custom request: shop sets the final price', async () => {
  const h = setup();
  const id = await h.placeOrder(CUSTOMER, { items: [], custom: '2 shiro, 1 mango juice', location: null, phone: '0911234567' });
  let o = await h.order(id);
  assert.equal(o.foodTotal, null);
  assert.equal(o.customRequest, '2 shiro, 1 mango juice');
  assert.equal(o.deliveryFee, 60); // skipped location -> base fee

  await h.tap(MERCHANT, `macc:${id}`);
  assert.match(h.lastTo(MERCHANT).text, /DHUMAA/); // asked for price in Oromo
  await h.text(MERCHANT, 'abc');
  assert.equal((await h.order(id)).status, 'PLACED');
  await h.text(MERCHANT, '450');
  o = await h.order(id);
  assert.equal(o.status, 'ACCEPTED');
  assert.equal(o.foodTotal, 450);
  assert.equal(o.commission, 36);
  assert.match(h.lastTo(CUSTOMER).text, /Send 450 Br/);
});

test('out of range for bicycles is refused before ordering', async () => {
  const h = setup();
  await h.text(CUSTOMER, '/start');
  await h.tap(CUSTOMER, 'lang:en');
  await h.text(CUSTOMER, '🛍 Order');
  await h.tap(CUSTOMER, 'm:M1');
  await h.tap(CUSTOMER, 'add:I1');
  await h.tap(CUSTOMER, 'checkout');
  await h.send(CUSTOMER, CUSTOMER, { location: { latitude: 7.25, longitude: 38.6 } }); // ~5.5 km away
  assert.match(h.lastTo(CUSTOMER).text, /we deliver up to 3 km/);
  assert.equal((await h.store.listOrders()).length, 0);
});

test('fraud: the same payment reference cannot be reused on another order', async () => {
  const h = setup();
  const a = await h.placeOrder(CUSTOMER);
  await h.tap(MERCHANT, `macc:${a}`);
  await h.text(CUSTOMER, 'CK12AB34CD');
  await h.tap(MERCHANT, `mpay:${a}`);

  const b = await h.placeOrder(CUSTOMER);
  await h.tap(MERCHANT, `macc:${b}`);
  await h.text(CUSTOMER, 'CK12AB34CD');
  assert.match(h.lastTo(CUSTOMER).text, /already used/);
  assert.equal((await h.order(b)).status, 'ACCEPTED');
});

test('rider who never pressed Start gets told, and the job stays open', async () => {
  const h = setup();
  h.blocked.add(String(RIDER2));
  const id = await h.placeOrder(CUSTOMER);
  await h.tap(MERCHANT, `macc:${id}`);
  await h.text(CUSTOMER, 'CK99XY88ZZ');
  await h.tap(MERCHANT, `mpay:${id}`);
  await h.tap(RIDER2, `take:${id}`, GROUP);
  assert.match(h.lastAlert().text, /Start/);
  assert.equal((await h.order(id)).riderId, '');
  await h.tap(RIDER, `take:${id}`, GROUP);
  assert.equal((await h.order(id)).riderId, String(RIDER));
});

test('cancel rules: customer only before paying, admin anytime', async () => {
  const h = setup();
  const id = await h.placeOrder(CUSTOMER);
  await h.tap(MERCHANT, `macc:${id}`);
  await h.text(CUSTOMER, 'CK55AA66BB');
  // customer tries to cancel after sending money -> refused
  await h.tap(CUSTOMER, `ccancel:${id}`);
  assert.match(h.lastAlert().text, /can't be cancelled/);
  // ATTACK: someone else cancels the customer's order
  await h.tap(STRANGER, `ccancel:${id}`);
  assert.equal((await h.order(id)).status, 'PAYMENT_SUBMITTED');
  // non-admin presses admin cancel
  await h.tap(STRANGER, `acancel:${id}`, GROUP);
  assert.match(h.lastAlert().text, /not allowed/);
  // admin cancels: everyone is told
  await h.tap(ADMIN, `acancel:${id}`, GROUP);
  assert.equal((await h.order(id)).status, 'CANCELLED');
  assert.match(h.lastTo(CUSTOMER).text, /cancelled/);
  assert.match(h.lastTo(MERCHANT).text, /haqameera/);

  // customer CAN cancel before paying
  const id2 = await h.placeOrder(CUSTOMER);
  await h.tap(CUSTOMER, `ccancel:${id2}`);
  assert.equal((await h.order(id2)).status, 'CANCELLED');
});

test('shop without Telegram: messages go to the dispatch group and admin can act for it', async () => {
  const h = setup();
  h.store._db.merchants[0].telegramId = '';
  const id = await h.placeOrder(CUSTOMER);
  const toGroup = h.sentTo(GROUP).find((c) => /no Telegram, call 0911111111/.test(c.payload.text));
  assert.ok(toGroup, 'dispatch group should get the shop message');
  assert.deepEqual(h.buttons(toGroup.payload), [`macc:${id}`, `mrej:${id}`]);
  await h.tap(ADMIN, `macc:${id}`, GROUP);
  assert.equal((await h.order(id)).status, 'ACCEPTED');
});

// helper: run one order all the way to DELIVERED
async function deliverOne(h, cust = CUSTOMER) {
  const id = await h.placeOrder(cust);
  await h.tap(MERCHANT, `macc:${id}`);
  await h.text(cust, `CK${String(Math.random()).slice(2, 10)}`);
  await h.tap(MERCHANT, `mpay:${id}`);
  await h.tap(RIDER, `take:${id}`, GROUP);
  await h.tap(MERCHANT, `mready:${id}`);
  await h.tap(RIDER, `rpick:${id}`);
  await h.tap(RIDER, `rdone:${id}`);
  return id;
}

test('ETA: shown on menu, summary, after payment and on the way; status times recorded', async () => {
  const h = setup();
  const id = await h.placeOrder(CUSTOMER);
  const menu = h.calls.filter((c) => c.method === 'editMessageText' && /🏪/.test(c.payload.text)).at(-1).payload.text;
  // default prep 20 + pickup 5 + 2 km * 4.5 + buffer 5 = 39 -> 35-45 min
  assert.match(menu, /about 35–45 min/);
  const summary = h.sentTo(CUSTOMER).find((c) => /Order summary/.test(c.payload.text)).payload.text;
  // ~0.7 km -> 20 + 5 + 3.15 + 5 = 33 -> 30-40 min
  assert.match(summary, /about 30–40 min/);
  await h.tap(MERCHANT, `macc:${id}`);
  await h.text(CUSTOMER, 'CK12AB34CD');
  await h.tap(MERCHANT, `mpay:${id}`);
  assert.match(h.lastTo(CUSTOMER).text, /Estimated arrival: in about 30–40 min/);
  let o = await h.order(id);
  assert.equal(o.etaMin, 30);
  assert.equal(o.etaMax, 40);
  assert.ok(o.acceptedAt && o.confirmedAt);
  await h.tap(RIDER, `take:${id}`, GROUP);
  await h.tap(RIDER, `rpick:${id}`);
  assert.match(h.lastTo(CUSTOMER).text, /Arriving in about 5–10 min/);
  o = await h.order(id);
  assert.ok(o.pickedUpAt);
});

test('ETA learns the real prep time of each shop', async () => {
  const { learnedPrepMinutes } = await import('../src/core/eta.js');
  const mk = (i, prep) => ({ createdAt: `2026-11-0${i} 12:00:00`, confirmedAt: `2026-11-0${i} 12:00:00`, readyAt: `2026-11-0${i} 12:${String(prep).padStart(2, '0')}:00` });
  assert.equal(learnedPrepMinutes([mk(1, 30), mk(2, 30)], 20), 20); // too few samples -> fallback
  assert.equal(learnedPrepMinutes([mk(1, 30), mk(2, 32), mk(3, 28), mk(4, 31), mk(5, 55)], 20), 31); // median: one slow day does not skew it
});

test('ratings: stars -> rider thumb -> comment; shop notified; low ratings alert you', async () => {
  const h = setup();
  const id = await deliverOne(h);

  // ATTACK: someone else tries to rate this order
  await h.tap(STRANGER, `rf:${id}:1`);
  assert.equal(await h.store.getReview(id), null);

  await h.tap(CUSTOMER, `rf:${id}:2`);
  let r = await h.store.getReview(id);
  assert.equal(r.foodStars, 2);
  assert.match(h.sentTo(GROUP).at(-1).payload.text, /Low food rating/);
  assert.deepEqual(h.buttons(h.lastTo(CUSTOMER)), [`rr:${id}:up`, `rr:${id}:down`]);

  // double tap: can't rate twice
  await h.tap(CUSTOMER, `rf:${id}:5`);
  assert.match(h.lastAlert().text, /already rated/);
  assert.equal((await h.store.getReview(id)).foodStars, 2);

  await h.tap(CUSTOMER, `rr:${id}:down`);
  assert.equal((await h.store.getReview(id)).riderThumb, 'down');
  assert.match(h.sentTo(GROUP).at(-1).payload.text, /got 👎/);
  assert.deepEqual(h.buttons(h.lastTo(CUSTOMER)), [`rvskip:${id}`]);

  await h.text(CUSTOMER, 'Food was cold');
  r = await h.store.getReview(id);
  assert.equal(r.comment, 'Food was cold');
  assert.match(h.lastTo(CUSTOMER).text, /Thank you/);
  // shop gets it in Afaan Oromo
  assert.match(h.lastTo(MERCHANT).text, /Yaada haaraa.*⭐⭐☆☆☆/s);
  assert.match(h.lastTo(MERCHANT).text, /Food was cold/);
  assert.match(h.sentTo(GROUP).at(-1).payload.text, /Food was cold/);

  // after the review, normal text is not treated as a comment
  await h.text(CUSTOMER, 'hello');
  assert.equal((await h.store.getReview(id)).comment, 'Food was cold');
});

test('cannot rate an order that is not delivered yet', async () => {
  const h = setup();
  const id = await h.placeOrder(CUSTOMER);
  await h.tap(CUSTOMER, `rf:${id}:5`);
  assert.equal(await h.store.getReview(id), null);
});

test('shop rating appears in the shop list only after 5 reviews; /today shows ratings', async () => {
  const h = setup();
  for (let i = 0; i < 5; i++) {
    const id = await deliverOne(h);
    await h.tap(CUSTOMER, `rf:${id}:${i < 4 ? 5 : 4}`);
    await h.tap(CUSTOMER, `rr:${id}:up`);
    await h.tap(CUSTOMER, `rvskip:${id}`);
    if (i === 3) {
      await h.text(CUSTOMER, '🛍 Order');
      const list = h.lastTo(CUSTOMER).reply_markup.inline_keyboard.flat()[0].text;
      assert.equal(list, '🏪 Burger House'); // 4 reviews: hidden
    }
  }
  await h.text(CUSTOMER, '🛍 Order');
  const label = h.lastTo(CUSTOMER).reply_markup.inline_keyboard.flat()[0].text;
  assert.equal(label, '🏪 Burger House · ⭐ 4.8 (5)');
  await h.text(ADMIN, '/today', GROUP);
  assert.match(h.lastTo(GROUP).text, /Food rating: 4\.8 \(5 reviews\)/);
  assert.match(h.lastTo(GROUP).text, /5 👍 · 0 👎/);
});

test('desktop user: inline menu, Skip button, pasted location — full order without phone-only buttons', async () => {
  const h = setup();
  await h.text(CUSTOMER, '/start');
  await h.tap(CUSTOMER, 'lang:en');
  // home always has inline buttons (visible on Telegram Desktop)
  assert.deepEqual(h.buttons(h.photosTo(CUSTOMER).at(-1).payload), ['menu:order', 'menu:orders', 'menu:help', 'menu:lang']);
  // random text -> "Use the buttons below" WITH inline buttons
  await h.text(CUSTOMER, 'hello');
  assert.match(h.lastTo(CUSTOMER).text, /buttons below/);
  assert.deepEqual(h.buttons(h.lastTo(CUSTOMER)), ['menu:order', 'menu:orders', 'menu:help', 'menu:lang']);
  // inline Order -> shop list
  await h.tap(CUSTOMER, 'menu:order');
  assert.ok(h.buttons(h.lastEdit()).includes('m:M1'));
  await h.tap(CUSTOMER, 'm:M1');
  await h.tap(CUSTOMER, 'add:I1');
  await h.tap(CUSTOMER, 'checkout');
  // the computer tip is part of the one location message (no separate message)
  assert.match(h.lastTo(CUSTOMER).text, /On a computer/);
  // an inline Skip on an older message still works
  await h.tap(CUSTOMER, 'skiploc');
  assert.match(h.lastTo(CUSTOMER).text, /Step 3 of 4/);
  assert.match(h.lastTo(CUSTOMER).text, /What's near you/);
  await h.text(CUSTOMER, 'Near the bus station, green gate');
  await h.text(CUSTOMER, '0911234567');
  await h.tap(CUSTOMER, 'confirm');
  const o = (await h.store.listOrders({ customerId: CUSTOMER })).at(-1);
  assert.equal(o.status, 'PLACED');
  assert.equal(o.landmark, 'Near the bus station, green gate');
  assert.equal(o.distanceKm, null);
});

test('desktop user can paste coordinates or a Google Maps link as location', async () => {
  const { parseLatLng } = await import('../src/core/orders.js');
  assert.deepEqual(parseLatLng('7.2001, 38.5995'), { lat: 7.2001, lng: 38.5995 });
  assert.deepEqual(parseLatLng('https://www.google.com/maps/@7.2050,38.6000,17z'), { lat: 7.205, lng: 38.6 });
  assert.deepEqual(parseLatLng('https://maps.google.com/?q=7.2101,38.6010'), { lat: 7.2101, lng: 38.601 });
  assert.equal(parseLatLng('near the bank'), null);
  assert.equal(parseLatLng('call me 0911234567'), null);

  const h = setup();
  await h.text(CUSTOMER, '/start');
  await h.tap(CUSTOMER, 'lang:en');
  await h.tap(CUSTOMER, 'menu:order');
  await h.tap(CUSTOMER, 'm:M1');
  await h.tap(CUSTOMER, 'add:I1');
  await h.tap(CUSTOMER, 'checkout');
  await h.text(CUSTOMER, 'https://www.google.com/maps/@7.2050,38.6000,17z');
  assert.match(h.lastTo(CUSTOMER).text, /landmark/);
  await h.text(CUSTOMER, 'Blue gate near school');
  await h.text(CUSTOMER, '0911234567');
  await h.tap(CUSTOMER, 'confirm');
  const o = (await h.store.listOrders({ customerId: CUSTOMER })).at(-1);
  assert.ok(o.distanceKm > 0.5 && o.distanceKm < 0.9, `distance ${o.distanceKm}`);
});

/** Walk one customer up to the order summary (Place order button shown). */
async function upToSummary(h, cust = CUSTOMER) {
  await h.text(cust, '/start');
  await h.tap(cust, 'lang:en');
  await h.text(cust, '🛍 Order');
  await h.tap(cust, 'm:M1');
  await h.tap(cust, 'add:I1');
  await h.tap(cust, 'checkout');
  await h.send(cust, cust, { location: { latitude: 7.205, longitude: 38.6 } });
  await h.text(cust, 'Near Abyssinia bank, blue gate');
  await h.send(cust, cust, { contact: { phone_number: '+251911234567', first_name: 'C' } });
}

test('double tap on Place order creates one order', async () => {
  const h = setup();
  await upToSummary(h);
  const welcomes = () => h.photosTo(CUSTOMER).length;
  const before = welcomes();
  await Promise.all([h.tap(CUSTOMER, 'confirm'), h.tap(CUSTOMER, 'confirm')]);
  assert.equal((await h.store.listOrders({ customerId: CUSTOMER })).length, 1);
  // the second tap is ignored: no "this menu is old" alert, no second home screen
  const alerts = h.calls.filter((c) => c.method === 'answerCallbackQuery').map((c) => c.payload.text);
  assert.equal(alerts.includes(t('en', 'staleButton')), false);
  assert.equal(welcomes(), before);
});

test('checkout still completes when saving the customer fails', async () => {
  const h = setup();
  await upToSummary(h);
  h.store.saveCustomer = async () => {
    throw new Error('row 100 not found in Customers');
  };
  const origError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args.join(' '));
  try {
    await h.tap(CUSTOMER, 'confirm');
    await h.tap(CUSTOMER, 'confirm'); // tapped again: still one order
  } finally {
    console.error = origError;
  }
  const orders = await h.store.listOrders({ customerId: CUSTOMER });
  assert.equal(orders.length, 1);
  assert.deepEqual(h.buttons(h.lastTo(MERCHANT)), [`macc:${orders[0].id}`, `mrej:${orders[0].id}`]);
  assert.match(h.sentTo(GROUP).at(-1).payload.text, new RegExp(`🆕 ${orders[0].id}`));
  assert.ok(errors.some((e) => /not found in Customers/.test(e)), 'the failure is logged');
  // the flow was reset: the old checkout button no longer works
  await h.tap(CUSTOMER, 'checkout');
  assert.equal(h.lastAlert().text, t('en', 'staleButton'));
});

test('an error after the button was answered is shown as a message', async () => {
  const h = setup();
  await upToSummary(h);
  h.store.createOrder = async () => {
    throw new Error('Sheets down');
  };
  // Telegram refuses a second answer to the same button
  const answered = new Set();
  h.bot.api.config.use(async (prev, method, payload, signal) => {
    if (method === 'answerCallbackQuery') {
      if (answered.has(payload.callback_query_id)) {
        return { ok: false, error_code: 400, description: 'Bad Request: query is too old and response timeout expired or query ID is invalid' };
      }
      answered.add(payload.callback_query_id);
    }
    return prev(method, payload, signal);
  });
  const origError = console.error;
  console.error = () => {};
  try {
    // the runner hands a failed update to bot.catch; handleUpdate alone rethrows it
    await h.tap(CUSTOMER, 'confirm').catch((err) => h.bot.errorHandler(err));
  } finally {
    console.error = origError;
  }
  assert.equal((await h.store.listOrders({ customerId: CUSTOMER })).length, 0);
  assert.equal(h.lastTo(CUSTOMER).text, t('en', 'error'));
});
test('two customers are handled in parallel', async () => {
  const h = setup();
  // slow down every store call by 300 ms so one customer's path takes measurable time
  for (const [name, fn] of Object.entries(h.store)) {
    if (typeof fn !== 'function' || name === 'close') continue;
    h.store[name] = async (...args) => {
      await new Promise((r) => setTimeout(r, 300));
      return fn.apply(h.store, args);
    };
  }
  const flow = async (id) => {
    await h.text(id, '/start');
    await h.tap(id, 'lang:en');
    await h.text(id, '🛍 Order');
  };
  const t0 = Date.now();
  await flow(CUSTOMER);
  const single = Date.now() - t0;
  assert.ok(single >= 300, `single path should be slow, was ${single}ms`);
  const t1 = Date.now();
  await Promise.all([flow(101), flow(102)]);
  const both = Date.now() - t1;
  assert.ok(both < 1.5 * single, `parallel ${both}ms should be < 1.5 x ${single}ms`);
});

test('old button after restart shows home', async () => {
  const h = setup();
  await h.store.saveCustomer({ id: String(CUSTOMER), name: 'C', phone: '+251911234567', lang: 'en' });
  await h.tap(CUSTOMER, 'checkout');
  assert.equal(h.lastAlert().text, t('en', 'staleButton'));
  assert.equal(h.lastAlert().show_alert, true);
  assert.match(h.photosTo(CUSTOMER).at(-1).payload.caption, /Welcome to/);
});

// ---------- welcome screen (banner + persistent bottom menu) ----------

const HOME = ['menu:order', 'menu:orders', 'menu:help', 'menu:lang'];

test('welcome: one menu line with a persistent keyboard, then the banner with inline buttons', async () => {
  const h = setup();
  await h.text(CUSTOMER, '/start');
  const mark = h.calls.length;
  await h.tap(CUSTOMER, 'lang:en');
  const out = h.outTo(CUSTOMER, mark);
  assert.deepEqual(out.map((c) => c.method), ['sendMessage', 'sendPhoto']);
  assert.equal(out[0].payload.text, '🌐 English ✅');
  assert.equal(out[0].payload.reply_markup.is_persistent, true);
  assert.equal(out[0].payload.reply_markup.keyboard[0][0].text, '🛍 Order');
  const photo = out[1].payload;
  assert.match(photo.caption, /Welcome to/);
  assert.equal(photo.parse_mode, 'HTML');
  assert.equal(photo.reply_markup.inline_keyboard[0][0].callback_data, 'menu:order');
  assert.equal(photo.reply_markup.inline_keyboard[0].length, 1, 'Start an order is full width');
  assert.equal(photo.reply_markup.inline_keyboard[0][0].text, '🛍 Start an order');
  assert.deepEqual(h.buttons(photo), HOME);
  assert.equal(h.sentTo(CUSTOMER).some((c) => c.payload.text === t('en', 'useMenu')), false);
});

test('welcome: a second /start sends only the banner; the menu line returns after another keyboard', async () => {
  const h = setup();
  await h.text(CUSTOMER, '/start');
  await h.tap(CUSTOMER, 'lang:en');
  let mark = h.calls.length;
  await h.text(CUSTOMER, '/start');
  assert.deepEqual(h.outTo(CUSTOMER, mark).map((c) => c.method), ['sendPhoto']);

  // the location step replaces the bottom menu with a "Send my location" keyboard
  await h.text(CUSTOMER, '🛍 Order');
  await h.tap(CUSTOMER, 'm:M1');
  await h.tap(CUSTOMER, 'add:I1');
  await h.tap(CUSTOMER, 'checkout');
  mark = h.calls.length;
  await h.text(CUSTOMER, '/start');
  const out = h.outTo(CUSTOMER, mark);
  assert.deepEqual(out.map((c) => c.method), ['sendMessage', 'sendPhoto']);
  assert.equal(out[0].payload.text, '🏠 Home');
  assert.equal(out[0].payload.reply_markup.is_persistent, true);
});

test('welcome: the bottom menu is back after an order is placed and after "too far"', async () => {
  const h = setup();
  await h.placeOrder(CUSTOMER);
  let mark = h.calls.length;
  await h.text(CUSTOMER, '/start');
  assert.deepEqual(h.outTo(CUSTOMER, mark).map((c) => c.method), ['sendPhoto']);

  await h.text(CUSTOMER, '🛍 Order');
  await h.tap(CUSTOMER, 'm:M1');
  await h.tap(CUSTOMER, 'add:I1');
  await h.tap(CUSTOMER, 'checkout');
  await h.send(CUSTOMER, CUSTOMER, { location: { latitude: 7.5, longitude: 38.6 } }); // ~33 km away
  assert.match(h.lastTo(CUSTOMER).text, /we deliver up to/);
  assert.equal(h.lastTo(CUSTOMER).reply_markup.is_persistent, true);
  mark = h.calls.length;
  await h.text(CUSTOMER, '/start');
  assert.deepEqual(h.outTo(CUSTOMER, mark).map((c) => c.method), ['sendPhoto']);
});

test('welcome: changing the language sends the menu again in the new language', async () => {
  const h = setup();
  await h.text(CUSTOMER, '/start');
  await h.tap(CUSTOMER, 'lang:en');
  await h.tap(CUSTOMER, 'menu:lang');
  const mark = h.calls.length;
  await h.tap(CUSTOMER, 'lang:om');
  const out = h.outTo(CUSTOMER, mark);
  assert.deepEqual(out.map((c) => c.method), ['sendMessage', 'sendPhoto']);
  assert.equal(out[0].payload.text, '🌐 Afaan Oromoo ✅');
  assert.equal(out[0].payload.reply_markup.keyboard[0][0].text, t('om', 'btnOrder'));
  assert.match(out[1].payload.caption, /Baga gara/);
});

test('welcome: when the picture fails, the caption arrives as text with the same buttons', async () => {
  const h = setup({ failPhoto: true });
  const origError = console.error;
  console.error = () => {};
  try {
    await h.text(CUSTOMER, '/start');
    await h.tap(CUSTOMER, 'lang:en');
  } finally {
    console.error = origError;
  }
  const last = h.lastTo(CUSTOMER);
  assert.match(last.text, /Welcome to/);
  assert.match(last.text, /<b>/);
  assert.equal(last.parse_mode, 'HTML');
  assert.deepEqual(h.buttons(last), HOME);
});

test('welcome: the real banner is uploaded once, then sent again by file_id', async () => {
  const h = setup({ realImages: true });
  await h.text(CUSTOMER, '/start');
  await h.tap(CUSTOMER, 'lang:en');
  await h.text(CUSTOMER, '/start');
  const [first, second] = h.photosTo(CUSTOMER).map((c) => c.payload.photo);
  assert.equal(typeof first, 'object', 'first send uploads the PNG');
  assert.equal(typeof second, 'string', 'second send reuses the file_id');
});

// ---------- guided checkout (Step N of 4, Back, Cancel, Edit) ----------

/** Walk one customer to the location step (cart: one Burger). Returns the call count before checkout. */
async function upToLocation(h, cust = CUSTOMER) {
  await h.text(cust, '/start');
  await h.tap(cust, 'lang:en');
  await h.text(cust, '🛍 Order');
  await h.tap(cust, 'm:M1');
  await h.tap(cust, 'add:I1');
  const mark = h.calls.length;
  await h.tap(cust, 'checkout');
  return mark;
}
const replyTexts = (payload) => (payload?.reply_markup?.keyboard || []).flat().map((b) => b.text);

test('checkout: the location step is one message with GPS, Skip, Back and Cancel buttons', async () => {
  const h = setup();
  const mark = await upToLocation(h);
  const out = h.outTo(CUSTOMER, mark);
  assert.equal(out.length, 1, 'one message for the location step');
  const msg = out[0].payload;
  assert.equal(msg.parse_mode, 'HTML');
  assert.ok(msg.text.startsWith('▰▰▱▱  Step 2 of 4\n'));
  assert.match(msg.text, /<b>📍 Where should we deliver\?<\/b>/);
  const kb = msg.reply_markup.keyboard.flat();
  assert.ok(kb.some((b) => b.request_location === true), 'has a request_location button');
  assert.deepEqual(replyTexts(msg), ['📍 Send my location', '⏭ Skip', '⬅️ Back', '❌ Cancel']);
  assert.equal(msg.reply_markup.resize_keyboard, true);
});

test('checkout: Back from the landmark step sends the location step again', async () => {
  const h = setup();
  await upToLocation(h);
  await h.text(CUSTOMER, '⏭ Skip');
  const landmark = h.lastTo(CUSTOMER);
  assert.match(landmark.text, /Step 3 of 4/);
  assert.deepEqual(replyTexts(landmark), ['⬅️ Back', '❌ Cancel']);
  const mark = h.calls.length;
  await h.text(CUSTOMER, '⬅️ Back');
  const out = h.outTo(CUSTOMER, mark);
  assert.equal(out.length, 1);
  assert.match(out[0].payload.text, /Step 2 of 4/);
  assert.ok(out[0].payload.reply_markup.keyboard.flat().some((b) => b.request_location));
  // the flow continues normally from there
  await h.send(CUSTOMER, CUSTOMER, { location: { latitude: 7.205, longitude: 38.6 } });
  assert.match(h.lastTo(CUSTOMER).text, /Step 3 of 4/);
});

test('checkout: Back from the phone step returns to the landmark step; Back from location returns to the menu', async () => {
  const h = setup();
  await upToLocation(h);
  await h.text(CUSTOMER, '⏭ Skip');
  await h.text(CUSTOMER, 'Near Abyssinia bank, blue gate');
  const phone = h.lastTo(CUSTOMER);
  assert.match(phone.text, /Step 4 of 4/);
  assert.deepEqual(replyTexts(phone), ['📞 Send my number', '⬅️ Back', '❌ Cancel']);
  assert.ok(phone.reply_markup.keyboard.flat().some((b) => b.request_contact));
  await h.text(CUSTOMER, '⬅️ Back');
  assert.match(h.lastTo(CUSTOMER).text, /Step 3 of 4/);
  await h.text(CUSTOMER, '⬅️ Back');
  assert.match(h.lastTo(CUSTOMER).text, /Step 2 of 4/);

  // location -> menu, as a new message, cart kept, bottom menu back
  const mark = h.calls.length;
  await h.text(CUSTOMER, '⬅️ Back');
  const out = h.outTo(CUSTOMER, mark);
  assert.equal(out.at(-1).method, 'sendMessage');
  const menu = out.at(-1).payload;
  assert.match(menu.text, /Step 1 of 4/);
  assert.match(menu.text, /1 × Burger = 250 Br/);
  assert.ok(h.buttons(menu).includes('rem:I1'));
  assert.ok(out.some((c) => c.payload.reply_markup?.is_persistent === true), 'bottom menu shown again');
  // and checkout works again with the same cart
  await h.tap(CUSTOMER, 'checkout');
  assert.match(h.lastTo(CUSTOMER).text, /Step 2 of 4/);
});

test('checkout: Cancel on the phone step clears the cart and shows home', async () => {
  const h = setup();
  await upToLocation(h);
  await h.text(CUSTOMER, '⏭ Skip');
  await h.text(CUSTOMER, 'Near Abyssinia bank, blue gate');
  const photos = h.photosTo(CUSTOMER).length;
  await h.text(CUSTOMER, '❌ Cancel');
  assert.equal(h.photosTo(CUSTOMER).length, photos + 1, 'home screen sent');
  assert.match(h.photosTo(CUSTOMER).at(-1).payload.caption, /Welcome to/);
  assert.equal(h.lastTo(CUSTOMER).reply_markup.is_persistent, true, 'bottom menu is back');
  await h.tap(CUSTOMER, 'checkout');
  assert.equal(h.lastAlert().text, t('en', 'staleButton'));
  assert.equal((await h.store.listOrders()).length, 0);
});

test('checkout: Back and Cancel outside checkout just point to the menu', async () => {
  const h = setup();
  await h.text(CUSTOMER, '/start');
  await h.tap(CUSTOMER, 'lang:en');
  await h.text(CUSTOMER, '⬅️ Back');
  assert.equal(h.lastTo(CUSTOMER).text, t('en', 'useMenu'));
  await h.text(CUSTOMER, '❌ Cancel');
  assert.equal(h.lastTo(CUSTOMER).text, t('en', 'useMenu'));
});

test('summary: "Almost done" brings back the bottom menu; Edit returns to the menu with the cart kept', async () => {
  const h = setup();
  await upToSummary(h);
  const sent = h.sentTo(CUSTOMER);
  const almost = sent.at(-2).payload;
  assert.equal(almost.text, '✅ Almost done!');
  assert.equal(almost.reply_markup.is_persistent, true);
  const summary = sent.at(-1).payload;
  assert.equal(summary.parse_mode, 'HTML');
  assert.match(summary.text, /💵 <b>70 Br<\/b> · cash to the rider/);
  assert.deepEqual(summary.reply_markup.inline_keyboard.map((row) => row.map((b) => b.callback_data)), [['confirm'], ['edit', 'cancelcart']]);
  assert.equal(summary.reply_markup.inline_keyboard[1][0].text, '✏️ Edit');

  await h.tap(CUSTOMER, 'edit');
  const menu = h.lastEdit();
  assert.equal(menu.parse_mode, 'HTML');
  assert.match(menu.text, /Step 1 of 4/);
  assert.match(menu.text, /1 × Burger = 250 Br/);
  assert.ok(h.buttons(menu).includes('rem:I1'));
  // the old summary's Place order no longer works: checkout details were cleared
  await h.tap(CUSTOMER, 'confirm');
  assert.equal((await h.store.listOrders()).length, 0);
  // go through checkout again and place the order
  await h.tap(CUSTOMER, 'checkout');
  await h.text(CUSTOMER, '⏭ Skip');
  await h.text(CUSTOMER, 'Near the bus station');
  await h.text(CUSTOMER, '0911234567');
  await h.tap(CUSTOMER, 'confirm');
  const orders = await h.store.listOrders({ customerId: CUSTOMER });
  assert.equal(orders.length, 1);
  assert.equal(orders[0].foodTotal, 250);
  assert.equal(orders[0].landmark, 'Near the bus station');
});

test('payment guide: tap-to-copy accounts, escaped names, help and call buttons', async () => {
  const h = setup({ accountName: 'Abebe & Sons' });
  const id = await h.placeOrder(CUSTOMER);
  await h.tap(MERCHANT, `macc:${id}`);
  const pay = h.lastTo(CUSTOMER);
  assert.equal(pay.parse_mode, 'HTML');
  assert.match(pay.text, /<code>0911111111<\/code>/);
  assert.match(pay.text, /<code>1000123<\/code>/);
  assert.match(pay.text, /Abebe &amp; Sons/);
  assert.deepEqual(h.buttons(pay), [`payhelp:${id}`, `callshop:${id}`, `ccancel:${id}`]);
  assert.equal(pay.reply_markup.inline_keyboard[0].length, 1);
});

test('payment guide: payhelp falls back to text, uses the picture when the file exists', async () => {
  const h = setup();
  const id = await h.placeOrder(CUSTOMER);
  await h.tap(MERCHANT, `macc:${id}`);
  h.config.paymentGuidePath = path.join('assets', 'images', 'no-such-file.png');
  let mark = h.calls.length;
  await h.tap(STRANGER, `payhelp:${id}`);
  let out = h.outTo(STRANGER, mark);
  assert.equal(out.length, 1);
  assert.equal(out[0].method, 'sendMessage');
  assert.match(out[0].payload.text, /FT/);
  assert.match(out[0].payload.text, /127/);
  h.config.paymentGuidePath = path.join('assets', 'images', 'logo.png');
  mark = h.calls.length;
  await h.tap(CUSTOMER, `payhelp:${id}`);
  out = h.outTo(CUSTOMER, mark);
  assert.deepEqual(out.map((c) => c.method), ['sendPhoto']);
  assert.match(out[0].payload.caption, /FT/);
});

test('payment guide: callshop is for the order customer only', async () => {
  const h = setup();
  const id = await h.placeOrder(CUSTOMER);
  await h.tap(MERCHANT, `macc:${id}`);
  const mark = h.calls.length;
  await h.tap(CUSTOMER, `callshop:${id}`);
  const out = h.outTo(CUSTOMER, mark);
  assert.equal(out.length, 1);
  assert.match(out[0].payload.text, /Burger House: 0911111111/);
  await h.tap(STRANGER, `callshop:${id}`);
  assert.match(h.lastAlert().text, /not allowed/);
  assert.equal(h.outTo(STRANGER).length, 0);
});
