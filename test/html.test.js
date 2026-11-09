import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, th, HTML } from '../src/bot/html.js';
import { appendLine, createNotifier } from '../src/bot/notify.js';
import { _strings } from '../src/i18n.js';

test('esc escapes & < > and tolerates null/numbers', () => {
  assert.equal(esc('a<b>&c'), 'a&lt;b&gt;&amp;c');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(42), '42');
});

test('HTML constant is frozen parse_mode', () => {
  assert.deepEqual(HTML, { parse_mode: 'HTML' });
  assert.ok(Object.isFrozen(HTML));
});

test('th escapes params but keeps template tags; raw params pass through', () => {
  _strings.__tmp = { en: '<b>{name}</b> {extra}' };
  try {
    assert.equal(th('en', '__tmp', { name: '<i>X</i>', extra: '<code>ok</code>' }, { raw: ['extra'] }),
      '<b>&lt;i&gt;X&lt;/i&gt;</b> <code>ok</code>');
  } finally {
    delete _strings.__tmp;
  }
  assert.match(th('en', 'orderPlaced', { id: 'A1', merchant: '<i>X</i>' }), /&lt;i&gt;X&lt;\/i&gt;/);
});

function fakeCtx(message) {
  const calls = [];
  return {
    calls,
    callbackQuery: { message },
    editMessageText: async (...a) => calls.push(['text', ...a]),
    editMessageCaption: async (...a) => calls.push(['caption', ...a]),
  };
}

test('appendLine keeps entities on a text message, no parse_mode', async () => {
  const entities = [{ type: 'bold', offset: 3, length: 3 }];
  const ctx = fakeCtx({ text: 'Hi Bob', entities });
  await appendLine(ctx, 'Done');
  const [kind, text, other] = ctx.calls[0];
  assert.equal(kind, 'text');
  assert.equal(text, 'Hi Bob\n\nDone');
  assert.deepEqual(other.entities, entities);
  assert.equal(other.parse_mode, undefined);
  assert.deepEqual(other.reply_markup, { inline_keyboard: [] });
});

test('appendLine edits the caption of a photo message', async () => {
  const ents = [{ type: 'bold', offset: 0, length: 2 }];
  const ctx = fakeCtx({ photo: [{}], caption: 'Hi', caption_entities: ents });
  await appendLine(ctx, 'Done');
  const [kind, other] = ctx.calls[0];
  assert.equal(kind, 'caption');
  assert.equal(other.caption, 'Hi\n\nDone');
  assert.deepEqual(other.caption_entities, ents);
});

test('appendLine ignores "not modified" errors', async () => {
  const ctx = fakeCtx({ text: 'x' });
  ctx.editMessageText = async () => { throw new Error('message is not modified'); };
  await appendLine(ctx, 'y');
});

test('toCustomer sends HTML and escapes params', async () => {
  const sent = [];
  const api = { sendMessage: async (...a) => sent.push(a) };
  const { toCustomer } = createNotifier({ api, store: {}, config: {} });
  await toCustomer({ customerId: 7, customerLang: 'en', id: 'A1' }, 'orderPlaced', { merchant: '<script>' }, { reply_markup: { x: 1 } });
  const [chat, text, other] = sent[0];
  assert.equal(chat, 7);
  assert.match(text, /&lt;script&gt;/);
  assert.doesNotMatch(text, /<script>/);
  assert.equal(other.parse_mode, 'HTML');
  assert.deepEqual(other.reply_markup, { x: 1 });
});

test('order ids in customer HTML messages are tap-to-copy (<code>), in every language', () => {
  const keys = ['orderPlaced', 'orderCancelled', 'orderRejected', 'payNow', 'payNotFound', 'hlPaid', 'hlRider', 'hlComing', 'hlDone'];
  for (const key of keys) {
    for (const lang of ['en', 'om', 'am']) {
      assert.ok(_strings[key][lang].includes('<code>{id}</code>'), `${key}.${lang}`);
    }
  }
  for (const lang of ['en', 'om', 'am']) {
    assert.match(_strings.payNow[lang].split('\n')[0], /<code>\{id\}<\/code>/, `payNow.${lang} first line`);
  }
});
