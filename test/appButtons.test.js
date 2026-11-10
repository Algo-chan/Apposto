// The bot's way into the mini app: Open shop buttons, quiet phone saving.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, LANGS } from '../src/i18n.js';
import { setup, CUSTOMER } from './helpers/botHarness.js';

const APP = 'https://x.test/app';
const webAppButtons = (payload) => (payload?.reply_markup?.inline_keyboard || []).flat().filter((b) => b.web_app);

async function start(h) {
  await h.text(CUSTOMER, '/start');
  await h.tap(CUSTOMER, 'lang:en');
}

test('the Order button offers the app when APP_URL is set, and the chat flow stays reachable', async () => {
  const h = setup({ env: { APP_URL: APP } });
  await start(h);
  await h.text(CUSTOMER, t('en', 'btnOrder'));
  const prompt = h.lastTo(CUSTOMER);
  assert.equal(prompt.text, t('en', 'openShopPrompt'));
  assert.deepEqual(webAppButtons(prompt).map((b) => b.web_app.url), [APP]);
  assert.deepEqual(h.buttons(prompt).filter(Boolean), ['menu:order']);
  await h.tap(CUSTOMER, 'menu:order');
  const shown = [h.lastTo(CUSTOMER), h.lastEdit()].some((p) => h.buttons(p).includes('m:M1'));
  assert.ok(shown, 'chat ordering still shows the shops');
});

test('the welcome message carries the Open shop button when APP_URL is set', async () => {
  const h = setup({ env: { APP_URL: APP } });
  await start(h);
  const welcome = h.photosTo(CUSTOMER).at(-1).payload;
  assert.deepEqual(webAppButtons(welcome).map((b) => b.web_app.url), [APP]);
});

test('without APP_URL the Order button shows the shops as before', async () => {
  const h = setup();
  await start(h);
  await h.text(CUSTOMER, t('en', 'btnOrder'));
  assert.ok(h.buttons(h.lastTo(CUSTOMER)).includes('m:M1'));
});

test('the customer\'s own contact shared outside checkout is saved quietly; a forwarded one is not', async () => {
  const h = setup({ env: { APP_URL: APP } });
  await start(h);
  const before = h.outTo(CUSTOMER).length;
  await h.send(CUSTOMER, CUSTOMER, { contact: { phone_number: '+251911234567', first_name: 'C', user_id: CUSTOMER } });
  assert.equal((await h.store.getCustomer(CUSTOMER)).phone, '0911234567');
  assert.equal(h.outTo(CUSTOMER).length, before, 'no reply');
  await h.send(CUSTOMER, CUSTOMER, { contact: { phone_number: '+251922222222', first_name: 'X', user_id: 999 } });
  assert.equal((await h.store.getCustomer(CUSTOMER)).phone, '0911234567');
  assert.equal(h.lastTo(CUSTOMER).text, t('en', 'useMenu'));
});

test('i18n: the app button texts exist in every language', () => {
  for (const key of ['btnOpenShop', 'btnOrderInChat', 'openShopPrompt', 'menuButtonText']) {
    for (const lang of LANGS) assert.ok(t(lang, key) && t(lang, key) !== key, `${key}.${lang}`);
  }
});
