import http from 'node:http';
import { run } from '@grammyjs/runner';
import dotenv from 'dotenv';
import { loadConfig } from './config.js';
import { t } from './i18n.js';
import { createBot } from './bot/createBot.js';
import { applyProfile } from './bot/profile.js';
import { createMemoryStore, DEMO_SEED } from './storage/memoryStore.js';
import { createSheetsStore } from './storage/sheetsStore.js';
import { createHealthHandler, superviseRunner, startKeepAlive } from './runtime.js';
import { createPhotoProxy } from './web/photoProxy.js';
import { createHttpHandler } from './web/httpHandler.js';
import { createWebApi } from './web/api.js';
import { loadStaticFiles } from './web/staticFiles.js';

dotenv.config({ quiet: true });
if (process.argv.includes('--demo')) process.env.STORAGE = 'memory';
const { config, problems } = loadConfig();
if (config.storage === 'sheets') {
  const key = config.googlePrivateKey;
  const source = config.googleCredentialsSource;
  const detail =
    source === 'GOOGLE_CREDENTIALS_FILE'
      ? ` (${config.googleCredentialsFile})`
      : ` (base64 ${config.googleCredentialsBase64Set ? (config.googleCredentialsBase64Decoded ? 'decoded' : 'invalid') : 'not set'}, ` +
        `key ${key.length} chars, header ${key.includes('-----BEGIN') ? 'yes' : 'no'})`;
  console.log(`🔑 Google credentials: ${source}${detail}`);
}
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

const { bot, checkout, insights } = createBot({ config, store });
let runner = null;
let stopping = false;

// Hosting platforms (Render, Railway, Fly...) set PORT and expect the process to bind it.
// The bot itself uses long polling; the server answers the health check and serves the mini app
// (its page, API and the shop photos).
// Locally PORT is unset, so nothing changes.
const port = Number(process.env.PORT);
let healthServer = null;
if (Number.isInteger(port) && port > 0) {
  const health = createHealthHandler({ isRunning: () => !!runner && runner.isRunning() });
  const photos = createPhotoProxy({ api: bot.api, botToken: config.botToken, store });
  const api = createWebApi({ store, config, insights, checkout });
  const staticFiles = loadStaticFiles('webapp', { '/app/payment-guide.png': config.paymentGuidePath });
  healthServer = http.createServer(createHttpHandler({ health, photos, api, staticFiles, botToken: config.botToken }));
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
// The ☰ button next to the message box opens the mini app (when there is one).
if (config.appUrl) {
  try {
    await bot.api.setChatMenuButton({
      menu_button: { type: 'web_app', text: t('en', 'menuButtonText'), web_app: { url: config.appUrl } },
    });
  } catch (err) {
    console.error(`⚠️ Could not set the mini app menu button: ${err.description || err.message}`);
  }
}
// The profile text is nice to have: the bot runs without it.
try {
  await applyProfile(bot.api, { brand: config.brandName });
} catch (err) {
  console.error(`⚠️ Could not set the bot description: ${err.description || err.message}`);
}

await bot.init();
// Polling errors are retried every 3 s (the default doubles without a cap).
runner = run(bot, { runner: { retryInterval: 3000 } });
superviseRunner(runner, {
  isStopping: () => stopping,
  onCrash: (r) => {
    console.error('❌ Bot stopped unexpectedly:', r);
    process.exit(1);
  },
});
startKeepAlive({ baseUrl: process.env.RENDER_EXTERNAL_URL });

const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  try {
    await runner.stop();
    await store.close?.();
  } catch (err) {
    console.error('Error while stopping:', err);
  }
  if (healthServer) healthServer.close();
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

console.log(`🚲 @${bot.botInfo.username} is running (parallel mode). Press Ctrl+C to stop.`);
