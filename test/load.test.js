// Load check: 20 customers ordering at once must stay responsive.
// Real bot code, fake Telegram API, in-memory storage slowed by 100 ms per call (like Sheets).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBot } from '../src/bot/createBot.js';
import { createMemoryStore } from '../src/storage/memoryStore.js';
import { loadConfig } from '../src/config.js';

const BOT = { id: 999999, is_bot: true, first_name: 'Bot', username: 'test_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false };
const MERCHANT = 200, ADMIN = 500, GROUP = -1001;
const DELAY_MS = 100;
const CUSTOMERS = 20;

function setup() {
  const origWarn = console.warn;
  console.warn = () => {};
  const { config } = loadConfig({
    BOT_TOKEN: '1:test', STORAGE: 'memory', DISPATCH_CHAT_ID: String(GROUP), ADMIN_IDS: String(ADMIN), SUPPORT_PHONE: '0911000000',
  });
  console.warn = origWarn;
  const raw = createMemoryStore({
    merchants: [{
      id: 'M1', nameEn: 'Burger House', nameOm: 'Mana Baargarii', nameAm: 'በርገር ቤት', telegramId: String(MERCHANT),
      phone: '0911111111', lang: 'om', telebirr: '0911111111', cbeAccount: '1000123', accountName: 'Abebe K',
      commissionPct: 8, lat: 7.2, lng: 38.6, active: true,
    }],
    menu: [{ id: 'I1', merchantId: 'M1', nameEn: 'Burger', nameOm: 'Baargarii', nameAm: 'በርገር', price: 250, active: true }],
    riders: [],
  });
  // Imitate Sheets latency: every store method waits before running.
  const store = {};
  for (const [key, value] of Object.entries(raw)) {
    store[key] = typeof value === 'function'
      ? async (...args) => { await new Promise((r) => setTimeout(r, DELAY_MS)); return value(...args); }
      : value;
  }
  const { bot } = createBot({ config, store, botInfo: BOT });
  let mid = 5000;
  bot.api.config.use(async (_prev, method, payload) => {
    if (method.startsWith('send') || method === 'editMessageText') {
      return { ok: true, result: { message_id: mid++, date: 0, chat: { id: payload.chat_id, type: 'private' }, text: payload.text } };
    }
    return { ok: true, result: true };
  });

  let uid = 1;
  const user = (id) => ({ id, is_bot: false, first_name: `U${id}` });
  const chat = (id) => ({ id, type: 'private', first_name: `U${id}` });
  async function text(from, t) {
    const message = { message_id: uid, date: 0, chat: chat(from), from: user(from), text: t };
    if (t.startsWith('/')) message.entities = [{ type: 'bot_command', offset: 0, length: t.split(' ')[0].length }];
    await bot.handleUpdate({ update_id: uid++, message });
  }
  async function tap(from, data) {
    await bot.handleUpdate({
      update_id: uid++,
      callback_query: { id: String(uid), from: user(from), chat_instance: 'x', data, message: { message_id: 1, date: 0, chat: chat(from), from: BOT, text: 'msg' } },
    });
  }
  async function flow(cust) {
    const started = Date.now();
    await text(cust, '/start');
    await tap(cust, 'lang:en');
    await text(cust, '🛍 Order');
    await tap(cust, 'm:M1');
    await tap(cust, 'add:I1');
    await tap(cust, 'checkout');
    await text(cust, '⏭ Skip');
    await text(cust, 'Near Abyssinia bank, blue gate');
    await text(cust, '0911234567');
    await tap(cust, 'confirm');
    return Date.now() - started;
  }
  return { store, flow };
}

test('20 customers ordering at once stay responsive', async () => {
  const h = setup();
  await h.flow(1000); // warm-up (caches), not timed
  const single = await h.flow(1001);
  const ids = Array.from({ length: CUSTOMERS }, (_, i) => 2000 + i);
  const times = await Promise.all(ids.map((id) => h.flow(id)));
  const sorted = [...times].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const slowest = sorted.at(-1);
  console.log(`load: single ${single} ms, median ${median} ms, slowest ${slowest} ms`);

  const orders = (await h.store.listOrders()).filter((o) => Number(o.customerId) >= 2000);
  assert.equal(orders.length, CUSTOMERS);
  assert.ok(slowest <= single + 2000, `slowest ${slowest} ms exceeds single ${single} ms + 2000 ms`);
});
