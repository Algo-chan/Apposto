import http from 'node:http';
import dotenv from 'dotenv';
import { loadConfig } from './config.js';
import { createBot } from './bot/createBot.js';
import { createMemoryStore, DEMO_SEED } from './storage/memoryStore.js';
import { createSheetsStore } from './storage/sheetsStore.js';

dotenv.config({ quiet: true });
if (process.argv.includes('--demo')) process.env.STORAGE = 'memory';
const { config, problems } = loadConfig();
if (problems.length) {
  console.error('❌ Please fix your .env file:\n- ' + problems.join('\n- '));
  process.exit(1);
}

let store;
if (config.storage === 'memory') {
  console.log('🧪 Demo mode: data is kept in memory and lost when the bot stops.');
  const seed = structuredClone(DEMO_SEED);
  if (process.env.DEMO_MERCHANT_TELEGRAM_ID) seed.merchants[0].telegramId = process.env.DEMO_MERCHANT_TELEGRAM_ID;
  if (process.env.DEMO_RIDER_TELEGRAM_ID) {
    seed.riders.push({ telegramId: process.env.DEMO_RIDER_TELEGRAM_ID, name: 'Demo Rider', phone: '0922000000', lang: 'en', active: true });
  }
  store = createMemoryStore(seed);
} else {
  store = await createSheetsStore(config);
  console.log('📗 Connected to Google Sheets');
}

const { bot } = createBot({ config, store });

// Hosting platforms (Render, Railway, Fly...) set PORT and expect the process to bind it.
// The bot itself uses long polling, so this is only a health endpoint for the platform.
// Locally PORT is unset, so nothing changes.
const port = Number(process.env.PORT);
let healthServer = null;
if (Number.isInteger(port) && port > 0) {
  healthServer = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, uptime: Math.round(process.uptime()) }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });
  healthServer.listen(port, '0.0.0.0', () => {
    console.log(`❤️  Health server listening on 0.0.0.0:${port}`);
  });
}

try {
  await bot.api.setMyCommands([
    { command: 'start', description: 'Start / Jalqabi / ጀምር' },
    { command: 'help', description: 'Help / Gargaarsa / እርዳታ' },
    { command: 'menu', description: 'Menu / Menuu / ምናሌ' },
  ]);
} catch (err) {
  console.error(`❌ Could not reach Telegram: ${err.description || err.message}`);
  console.error('   Check BOT_TOKEN in .env and your internet connection.');
  process.exit(1);
}

const stop = () => {
  bot.stop();
  if (healthServer) healthServer.close();
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

await bot.start({
  drop_pending_updates: false,
  onStart: (me) => console.log(`🚲 @${me.username} is running. Press Ctrl+C to stop.`),
});
