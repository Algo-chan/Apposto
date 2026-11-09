// Sending messages to customers, merchants, riders and the dispatch group.
// Every send is wrapped: one blocked user must never crash an order flow.
import { t, normLang } from '../i18n.js';
import { OrderError } from '../core/orders.js';
import { InputFile } from 'grammy';
import { th, HTML } from './html.js';

export function createNotifier({ api, store, config, images }) {
  async function send(chatId, text, other = {}) {
    if (!chatId) return null;
    try {
      return await api.sendMessage(chatId, text, other);
    } catch (err) {
      console.error(`send to ${chatId} failed: ${err.description || err.message}`);
      return null;
    }
  }

  /**
   * Send a rendered card. Reuses Telegram's file_id after the first upload. Returns null when
   * there is no image (caller sends text instead) or the send fails.
   */
  async function sendPhotoCached(chatId, key, args, other = {}) {
    if (!chatId || !images) return null;
    try {
      const known = images.fileId(key);
      if (known) return await api.sendPhoto(chatId, known, other);
      const buf = await images.png(key, args);
      if (!buf) return null;
      const res = await api.sendPhoto(chatId, new InputFile(buf, 'card.png'), other);
      const id = res?.photo?.at(-1)?.file_id;
      if (id) images.remember(key, id);
      return res;
    } catch (err) {
      console.error(`photo to ${chatId} failed: ${err.description || err.message}`);
      return null;
    }
  }

  const dispatch = (text, other) => send(config.dispatchChatId, text, other);

  function toCustomer(order, key, params = {}, other) {
    return send(order.customerId, th(order.customerLang, key, { id: order.id, ...params }), { ...other, ...HTML });
  }

  /**
   * Send to the merchant's Telegram. If the merchant has no Telegram (or blocked the bot) and
   * `fallback` is true, the message goes to the dispatch group so YOU can call the shop and
   * press the buttons for them (admins may act for any merchant).
   */
  async function toMerchant(merchant, key, params = {}, { other, fallback = false } = {}) {
    const lang = normLang(merchant.lang);
    if (merchant.telegramId) {
      const sent = await send(merchant.telegramId, t(lang, key, params), other);
      if (sent) return sent;
    }
    if (!fallback) return null;
    const header = `🏪 For ${merchant.names.en} (no Telegram, call ${merchant.phone}):\n\n`;
    return dispatch(header + t('en', key, params), other);
  }

  async function toRider(order, key, params = {}, other) {
    if (!order.riderId) return null;
    const rider = await store.getRider(order.riderId);
    return send(order.riderId, t(rider?.lang, key, { id: order.id, ...params }), other);
  }

  return { send, sendPhotoCached, dispatch, toCustomer, toMerchant, toRider };
}

/** Turn known errors into a friendly alert; unknown errors bubble up to bot.catch. */
export async function replyError(ctx, err, lang) {
  if (!(err instanceof OrderError)) throw err;
  const key =
    {
      FORBIDDEN: 'notAllowed',
      TAKEN: 'rTaken',
      BAD_TRANSITION: 'alreadyDone',
      NOT_FOUND: 'staleButton',
      DUPLICATE_REF: 'refUsed',
    }[err.code] || 'error';
  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: t(lang, key, { phone: '' }), show_alert: true }).catch(() => {});
  } else {
    await ctx.reply(t(lang, key, { phone: '' }));
  }
}

/** Append a line to the message a button was pressed on and remove (or replace) its buttons. */
export async function stampMessage(ctx, line, replyMarkup) {
  const msg = ctx.callbackQuery?.message;
  if (!msg) return;
  const base = msg.text || '';
  try {
    await ctx.editMessageText(`${base}\n\n${line}`.slice(0, 4096), {
      reply_markup: replyMarkup || { inline_keyboard: [] },
    });
  } catch (err) {
    if (!String(err.description || err.message).includes('not modified')) {
      console.error('edit failed:', err.description || err.message);
    }
  }
}

/**
 * Append a plain-text line to the message a button was pressed on (text or photo caption),
 * keeping its formatting entities, and remove (or replace) its buttons.
 */
export async function appendLine(ctx, line, replyMarkup) {
  const msg = ctx.callbackQuery?.message;
  if (!msg) return;
  const reply_markup = replyMarkup || { inline_keyboard: [] };
  try {
    if (msg.photo) {
      await ctx.editMessageCaption({
        caption: `${msg.caption || ''}

${line}`.slice(0, 1024),
        caption_entities: msg.caption_entities,
        reply_markup,
      });
    } else {
      await ctx.editMessageText(`${msg.text || ''}

${line}`.slice(0, 4096), {
        entities: msg.entities,
        reply_markup,
      });
    }
  } catch (err) {
    if (!String(err.description || err.message).includes('not modified')) {
      console.error('edit failed:', err.description || err.message);
    }
  }
}
