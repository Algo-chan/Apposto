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

const stop = () => bot.stop();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

await bot.start({
  drop_pending_updates: false,
  onStart: (me) => console.log(`🚲 @${me.username} is running. Press Ctrl+C to stop.`),
});
