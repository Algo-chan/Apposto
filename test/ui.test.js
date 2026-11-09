import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progressLine, renderMenu, renderSummary } from '../src/bot/ui.js';
import { summarizeCart } from '../src/core/orders.js';

const merchant = { id: 'M1', names: { en: 'Burger <House>', om: 'Mana Baargarii', am: 'በርገር ቤት' } };
const menu = [
  { id: 'I1', names: { en: 'Burger', om: 'Baargarii', am: 'በርገር' }, price: 250 },
  { id: 'I2', names: { en: 'Chips & dip', om: 'Chiipsii', am: 'ችፕስ' }, price: 120 },
];
const checkoutButton = (kb) => kb.inline_keyboard.flat().find((b) => b.callback_data === 'checkout');

test('progressLine shows filled bars and the step number', () => {
  assert.equal(progressLine('en', 1), '▰▱▱▱  Step 1 of 4');
  assert.equal(progressLine('en', 2), '▰▰▱▱  Step 2 of 4');
  assert.equal(progressLine('en', 4), '▰▰▰▰  Step 4 of 4');
});

test('menu: the Next button shows the item count (sum of quantities) and the food total', () => {
  const cart = { merchantId: 'M1', items: { I1: 2, I2: 1 }, custom: null };
  const { keyboard } = renderMenu({ merchant, menu, cart, lang: 'en', eta: null });
  assert.equal(checkoutButton(keyboard).text, '🛒 Next · 3 items · 620 Br ➜');
});

test('menu: a request-only cart reads "your request"', () => {
  const cart = { merchantId: 'M1', items: {}, custom: '2 shiro' };
  const { keyboard } = renderMenu({ merchant, menu, cart, lang: 'en', eta: null });
  assert.equal(checkoutButton(keyboard).text, '🛒 Next · your request ➜');
});

test('menu: Step 1 header, Shops / Clear buttons, escaped names and request, rating and ETA when known', () => {
  const cart = { merchantId: 'M1', items: { I2: 1 }, custom: '<i>spicy</i>' };
  const eta = { min: 35, max: 45 };
  const { text, keyboard } = renderMenu({ merchant, menu, cart, lang: 'en', eta, rating: { avg: 4.8, count: 5 } });
  assert.ok(text.startsWith('▰▱▱▱  Step 1 of 4\n'));
  assert.match(text, /<b>🏪 Burger &lt;House&gt;<\/b>/);
  assert.match(text, /⭐ 4\.8 \(5\) · 🕒 Delivery time: about 35–45 min/);
  assert.match(text, /1 × Chips &amp; dip = 120 Br/);
  assert.match(text, /&lt;i&gt;spicy&lt;\/i&gt;/);
  const flat = keyboard.inline_keyboard.flat();
  assert.deepEqual(flat.slice(-2).map((b) => [b.text, b.callback_data]), [['⬅️ Shops', 'back'], ['🗑 Clear', 'clear']]);

  // nothing known: no rating, no ETA, no "undefined"
  const bare = renderMenu({ merchant, menu, cart, lang: 'en', eta: null }).text;
  assert.doesNotMatch(bare, /⭐|🕒|undefined/);
  const onlyEta = renderMenu({ merchant, menu, cart, lang: 'en', eta, rating: null }).text;
  assert.match(onlyEta, /\n🕒 Delivery time/);
  assert.doesNotMatch(onlyEta, /⭐/);
});

test('summary: HTML-escaped values and a clear split of who gets paid what', () => {
  const cart = { merchantId: 'M1', items: { I1: 2 }, custom: null };
  const summary = summarizeCart(cart, new Map(menu.map((i) => [i.id, i])), 'en');
  const checkout = { deliveryFee: 40, distanceKm: 2.1, landmark: '<b>x</b> & y', phone: '0911234567' };
  const text = renderSummary({ merchant, summary, checkout, serviceFee: 10, lang: 'en', eta: { min: 30, max: 40 } });
  assert.match(text, /&lt;b&gt;x&lt;\/b&gt; &amp; y/);
  assert.doesNotMatch(text, /<b>x<\/b>/);
  assert.match(text, /Burger &lt;House&gt;/);
  assert.match(text, /🍲 Food <b>500 Br<\/b> · pay the shop/);
  assert.match(text, /🚲 Delivery 40 Br \(~2\.1 km\) · 🧾 Service 10 Br/);
  assert.match(text, /💵 <b>50 Br<\/b> · cash to the rider/);
  assert.match(text, /📞 <code>0911234567<\/code>/);
  assert.match(text, /about 30–40 min/);
});
