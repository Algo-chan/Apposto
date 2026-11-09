// Unit tests for the reliability middlewares (auto-answer buttons, slow-update log) and Telegram API retry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from 'grammy';
import { autoAnswerCallbacks, slowUpdateLog, chatKey, telegramRetry } from '../src/bot/reliability.js';
import { createBot } from '../src/bot/createBot.js';
import { createMemoryStore } from '../src/storage/memoryStore.js';
import { loadConfig } from '../src/config.js';

function fakeCtx({ callback = true } = {}) {
  const ctx = { chat: { id: 7 }, from: { id: 7 }, callbackQuery: callback ? { id: 'q' } : undefined, answered: 0 };
  ctx.answerCallbackQuery = async () => {
    ctx.answered++;
    return true;
  };
  return ctx;
}

test('chatKey uses chat id, then user id, else undefined', () => {
  assert.equal(chatKey({ chat: { id: -5 }, from: { id: 1 } }), '-5');
  assert.equal(chatKey({ from: { id: 1 } }), '1');
  assert.equal(chatKey({}), undefined);
});

test('answers an unanswered button', async () => {
  const ctx = fakeCtx();
  await autoAnswerCallbacks()(ctx, async () => {});
  assert.equal(ctx.answered, 1);
});

test('does not double-answer', async () => {
  const ctx = fakeCtx();
  await autoAnswerCallbacks()(ctx, async () => {
    await ctx.answerCallbackQuery({ text: 'hi' });
  });
  assert.equal(ctx.answered, 1);
});

test('does not answer when handler throws', async () => {
  const ctx = fakeCtx();
  await assert.rejects(
    autoAnswerCallbacks()(ctx, async () => {
      throw new Error('boom');
    }),
    /boom/
  );
  assert.equal(ctx.answered, 0);
});

test('logs slow updates', async () => {
  let t = 0;
  const lines = [];
  const mw = slowUpdateLog({ log: (s) => lines.push(s), now: () => t });
  const ctx = { ...fakeCtx(), update: { callback_query: {} } };
  await mw(ctx, async () => {
    t += 3500;
  });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /slow/);
  assert.match(lines[0], /3500/);
  await mw(ctx, async () => {
    t += 100;
  });
  assert.equal(lines.length, 1);
});

// ---------- Telegram API retry ----------

const httpError = () => new HttpError('Network request failed', new Error('ECONNRESET'));

/** prev that throws a network error for the first `failures` calls, then answers ok. */
function flakyPrev(failures) {
  const prev = async (method) => {
    prev.calls.push(method);
    if (prev.calls.length <= failures) throw httpError();
    return { ok: true, result: true };
  };
  prev.calls = [];
  return prev;
}

test('getUpdates bypasses the retry transformer installed by createBot', async () => {
  const origWarn = console.warn;
  console.warn = () => {};
  const { config } = loadConfig({ BOT_TOKEN: '1:test', STORAGE: 'memory', DISPATCH_CHAT_ID: '-1001', ADMIN_IDS: '500' });
  console.warn = origWarn;
  const { bot } = createBot({ config, store: createMemoryStore({}), botInfo: { id: 1, is_bot: true, first_name: 'B', username: 'b' } });
  const [transformer] = bot.api.config.installedTransformers();
  const prev = flakyPrev(1);
  await assert.rejects(transformer(prev, 'getUpdates', { offset: 0 }, undefined), (e) => e instanceof HttpError);
  assert.deepEqual(prev.calls, ['getUpdates']);
});

test('sends retry network errors a bounded number of times', async () => {
  const sleeps = [];
  const tf = telegramRetry({ networkTries: 3, sleep: async (ms) => sleeps.push(ms) });
  const prev = flakyPrev(Infinity);
  await assert.rejects(tf(prev, 'sendMessage', { chat_id: 1, text: 'x' }, undefined), (e) => e instanceof HttpError);
  assert.equal(prev.calls.length, 3);
  assert.equal(sleeps.length, 2);
});

test('sends recover from one network error', async () => {
  const tf = telegramRetry({ sleep: async () => {} });
  const prev = flakyPrev(1);
  assert.deepEqual(await tf(prev, 'sendMessage', { chat_id: 1, text: 'x' }, undefined), { ok: true, result: true });
  assert.equal(prev.calls.length, 2);
});

test('sends still wait out Telegram rate limits', async () => {
  const tf = telegramRetry({ sleep: async () => {} });
  let calls = 0;
  const prev = async () =>
    ++calls === 1
      ? { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 0 } }
      : { ok: true, result: true };
  assert.deepEqual(await tf(prev, 'sendMessage', { chat_id: 1, text: 'x' }, undefined), { ok: true, result: true });
  assert.equal(calls, 2);
});
