// Test harness: the real bot code, a fake Telegram API, in-memory storage.
import { createBot } from '../../src/bot/createBot.js';
import { createMemoryStore } from '../../src/storage/memoryStore.js';
import { loadConfig } from '../../src/config.js';
import { createImageCache } from '../../src/render/imageCache.js';

export const BOT = { id: 999999, is_bot: true, first_name: 'Bot', username: 'test_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false };
export const CUSTOMER = 100, MERCHANT = 200, RIDER = 300, RIDER2 = 301, ADMIN = 500, STRANGER = 666, GROUP = -1001;
export const CUSTOMER2 = 101;

/**
 * realImages: render real PNG cards (slower); default is a tiny fake picture.
 * slowRenderMs: the fake picture takes this long to render (a slow host).
 * awaitTracker: every send/tap also waits for the tracker work it started (the card).
 * env: extra config values; extraMerchants / extraMenu: more shops and items besides M1, I1, I2.
 */
export function setup({ failPhoto = false, failDelete = false, realImages = false, slowRenderMs = 0, awaitTracker = true, accountName = 'Abebe K', env = {}, extraMerchants = [], extraMenu = [] } = {}) {
  const origWarn = console.warn;
  console.warn = () => {};
  const { config } = loadConfig({
    BOT_TOKEN: '1:test', STORAGE: 'memory', DISPATCH_CHAT_ID: String(GROUP), ADMIN_IDS: String(ADMIN), SUPPORT_PHONE: '0911000000', ...env,
  });
  console.warn = origWarn;
  const store = createMemoryStore({
    merchants: [{
      id: 'M1', nameEn: 'Burger House', nameOm: 'Mana Baargarii', nameAm: 'በርገር ቤት', telegramId: String(MERCHANT),
      phone: '0911111111', lang: 'om', telebirr: '0911111111', cbeAccount: '1000123', accountName,
      commissionPct: 8, lat: 7.2, lng: 38.6, active: true,
    }, ...extraMerchants],
    menu: [
      { id: 'I1', merchantId: 'M1', nameEn: 'Burger', nameOm: 'Baargarii', nameAm: 'በርገር', price: 250, active: true },
      { id: 'I2', merchantId: 'M1', nameEn: 'Chips', nameOm: 'Chiipsii', nameAm: 'ችፕስ', price: 120, active: true },
      ...extraMenu,
    ],
    riders: [
      { telegramId: String(RIDER), name: 'Kebede', phone: '0922222222', lang: 'am', active: true },
      { telegramId: String(RIDER2), name: 'Lensa', phone: '0933333333', lang: 'om', active: true },
    ],
  });
  const fakeRender = slowRenderMs
    ? () => new Promise((r) => setTimeout(() => r(Buffer.from('png')), slowRenderMs))
    : () => Buffer.from('png');
  const images = realImages ? undefined : createImageCache({ render: fakeRender });
  const { bot, tracker } = createBot({ config, store, botInfo: BOT, images, warmImages: false });
  const calls = [];
  const blocked = new Set(); // chat ids that never pressed Start
  let mid = 5000;
  let failWhen = null; // (method, payload) => true: that call fails once with a 400
  const failOnce = (pred) => { failWhen = pred; };
  bot.api.config.use(async (_prev, method, payload) => {
    const call = { method, payload };
    calls.push(call);
    const res = await fakeApi(method, payload);
    call.result = res.result;
    return res;
  });
  async function fakeApi(method, payload) {
    if (failWhen?.(method, payload)) {
      failWhen = null;
      return { ok: false, error_code: 400, description: 'Bad Request: test failure' };
    }
    if (method === 'deleteMessage' && failDelete) {
      return { ok: false, error_code: 400, description: 'Bad Request: message to delete not found' };
    }
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
  }

  let uid = 1;
  const user = (id) => ({ id, is_bot: false, first_name: `U${id}` });
  const chatOf = (id) => (id < 0 ? { id, type: 'supergroup', title: 'Dispatch' } : { id, type: 'private', first_name: `U${id}` });
  async function send(from, chatId, fields) {
    const message = { message_id: uid, date: 0, chat: chatOf(chatId), from: user(from), ...fields };
    if (typeof fields.text === 'string' && fields.text.startsWith('/')) {
      message.entities = [{ type: 'bot_command', offset: 0, length: fields.text.split(' ')[0].length }];
    }
    await bot.handleUpdate({ update_id: uid++, message });
    if (awaitTracker) await tracker.idle?.();
  }
  const text = (from, t, chatId = from) => send(from, chatId, { text: t });
  async function tap(from, data, chatId = from, messageText = 'msg') {
    await bot.handleUpdate({
      update_id: uid++,
      callback_query: { id: String(uid), from: user(from), chat_instance: 'x', data, message: { message_id: 1, date: 0, chat: chatOf(chatId), from: BOT, text: messageText } },
    });
    if (awaitTracker) await tracker.idle?.();
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

  /** Tracker cards sent to a chat (photo, or text when the picture failed): they carry the timeline. */
  const cardsTo = (chatId) =>
    outTo(chatId).filter((c) => (c.payload.caption ?? c.payload.text ?? '').match(/^(✅|🟢|⚪) /gmu)?.length === 6);
  const deletedIn = (chatId) =>
    calls.filter((c) => c.method === 'deleteMessage' && String(c.payload.chat_id) === String(chatId)).map((c) => c.payload.message_id);
  /** Card message ids that were sent and never deleted. */
  const liveCards = (chatId) => {
    const gone = new Set(deletedIn(chatId));
    return cardsTo(chatId).map((c) => c.result.message_id).filter((m) => !gone.has(m));
  };

  return { bot, store, calls, blocked, failOnce, text, send, tap, sentTo, photosTo, outTo, lastTo, lastAlert, buttons, lastEdit, order, latestOrder, placeOrder, config, tracker, cardsTo, deletedIn, liveCards };
}
