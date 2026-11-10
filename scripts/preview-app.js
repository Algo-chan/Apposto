// DEV ONLY: try the mini app in a normal browser on this computer, with demo data.
// Nothing here talks to Telegram or the Google Sheet: the bot token is fake, every Telegram
// call is answered locally (and printed), and the data lives in memory.
// The demo shop accepts each order after a few seconds and confirms each payment, so every
// status screen can be seen.
//   npm run preview-app   ->  open the printed address
import http from 'node:http';
import { loadConfig } from '../src/config.js';
import { createBot } from '../src/bot/createBot.js';
import { createMemoryStore, DEMO_SEED } from '../src/storage/memoryStore.js';
import { createImageCache } from '../src/render/imageCache.js';
import { createHealthHandler } from '../src/runtime.js';
import { createHttpHandler } from '../src/web/httpHandler.js';
import { createWebApi } from '../src/web/api.js';
import { loadStaticFiles } from '../src/web/staticFiles.js';
import { signInitData } from '../src/web/initData.js';
import { STATUS } from '../src/core/orders.js';

const PORT = Number(process.env.PREVIEW_PORT) || 8787;
const TOKEN = '0:preview-not-a-real-token';
const BOT = { id: 1, is_bot: true, first_name: 'Preview', username: 'preview_bot', can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false };

// Never read .env here: the live token must not be used by the preview.
const { config } = loadConfig({ BOT_TOKEN: TOKEN, STORAGE: 'memory', SUPPORT_PHONE: '0911000000' });

const seed = structuredClone(DEMO_SEED);
Object.assign(seed.merchants[0], { lat: 7.2, lng: 38.6, banner: 'DEMO_BANNER_M1' });
seed.merchants.push({
  id: 'M2', nameEn: 'Mama Coffee', nameOm: 'Buna Haadhaa', nameAm: 'የእማማ ቡና', telegramId: '', phone: '0922000000', lang: 'en',
  telebirr: '0922000000', cbeAccount: '', accountName: 'Mama Coffee', commissionPct: 8, lat: 7.201, lng: 38.601, active: true,
});
seed.menu.forEach((i) => (i.photo = `DEMO_PHOTO_${i.id}`));
seed.menu[2].photo = ''; // one item without a photo, to see the placeholder
seed.menu.push({ id: 'I4', merchantId: 'M2', nameEn: 'Macchiato', nameOm: 'Makiyaatoo', nameAm: 'ማኪያቶ', price: 40, active: true, photo: 'DEMO_PHOTO_I4' });
const store = createMemoryStore(seed);
// enough reviews for the burger shop to show its rating
for (let i = 0; i < 6; i++) await store.createReview({ orderId: `DEMO-R${i}`, merchantId: 'M1', foodStars: i === 0 ? 4 : 5 });

const images = createImageCache({ render: () => Buffer.from('png') });
const { bot, service, checkout, insights } = createBot({ config, store, botInfo: BOT, images, warmImages: false });
let mid = 1;
bot.api.config.use(async (_prev, method, payload) => {
  const text = String(payload.text ?? payload.caption ?? '').split('\n')[0].slice(0, 70);
  console.log(`  [telegram] ${method} → ${payload.chat_id ?? ''} ${text}`);
  if (method.startsWith('send') || method.startsWith('edit')) {
    const result = { message_id: mid++, date: 0, chat: { id: payload.chat_id, type: 'private' }, text: payload.text };
    if (method === 'sendPhoto') result.photo = [{ file_id: `P${mid}`, file_unique_id: `U${mid}`, width: 800, height: 400 }];
    return { ok: true, result };
  }
  return { ok: true, result: true };
});

// Demo pictures drawn on the fly (the real ones come from Telegram): a food emoji on a soft colour.
const DEMO_ART = {
  DEMO_BANNER_M1: ['🍔🍟🥤', '#ffb703', '#fb8500'],
  DEMO_PHOTO_I1: ['🍔', '#ffe8cc', '#ffc078'],
  DEMO_PHOTO_I2: ['🍟', '#fff3bf', '#ffd43b'],
  DEMO_PHOTO_I4: ['☕', '#f1e3d3', '#c9a27e'],
};
function demoPicture(id) {
  const wide = id.includes('BANNER');
  const [w, hgt] = wide ? [800, 400] : [400, 400];
  const [art, from, to] = DEMO_ART[id] || ['🍽️', '#e9ecef', '#ced4da'];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="58%" font-size="${wide ? 150 : 200}" text-anchor="middle" dominant-baseline="middle">${art}</text></svg>`;
  return { body: Buffer.from(svg), type: 'image/svg+xml' };
}
const photos = { get: async (id) => (id.startsWith('DEMO_') ? demoPicture(id) : null) };

// The page, signed in as demo customer 100 (a real Telegram app gets this from Telegram).
const initData = signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 100, first_name: 'Demo', last_name: 'Customer' }) }, TOKEN);
const staticFiles = loadStaticFiles('webapp', { '/app/payment-guide.png': config.paymentGuidePath, '/app/logo.png': 'assets/images/logo.png' });
const page = staticFiles.get('/app/index.html');
const injected = { ...page, body: Buffer.from(page.body.toString('utf8').replace('<head>', `<head>\n  <script>window.__DEV_INIT_DATA__ = ${JSON.stringify(initData)};</script>`)) };
for (const p of ['/app', '/app/', '/app/index.html']) staticFiles.set(p, injected);

const api = createWebApi({ store, config, insights, checkout });
const handler = createHttpHandler({ health: createHealthHandler({ isRunning: () => true }), photos, api, staticFiles, botToken: TOKEN });

// The demo shop: accepts orders and confirms payments after a few seconds.
const seenAt = new Map();
setInterval(async () => {
  for (const o of await store.listOrders()) {
    const key = `${o.id}:${o.status}`;
    if (!seenAt.has(key)) seenAt.set(key, Date.now());
    if (Date.now() - seenAt.get(key) < 6000) continue;
    try {
      if (o.status === STATUS.PLACED) {
        // with a special request the shop sets the whole food total: the items + 50 Br here
        const items = JSON.parse(o.itemsJson || '[]').reduce((sum, l) => sum + l.qty * l.price, 0);
        await service.accept(o.id, o.merchantId, o.customRequest ? items + 50 : null);
        console.log(`  [demo shop] accepted ${o.id}`);
      } else if (o.status === STATUS.PAYMENT_SUBMITTED) {
        await service.transition(o.id, STATUS.CONFIRMED);
        console.log(`  [demo shop] payment confirmed for ${o.id}`);
      }
    } catch (err) {
      console.log(`  [demo shop] ${o.id}: ${err.message}`);
    }
  }
}, 2000).unref();

http.createServer(handler).listen(PORT, '127.0.0.1', () => {
  console.log(`🧪 Mini app preview (demo data, nothing is sent anywhere): http://localhost:${PORT}/app`);
  console.log('   Press Ctrl+C to stop.');
});
