import { Bot, session } from 'grammy';
import { sequentialize } from '@grammyjs/runner';
import { chatKey, autoAnswerCallbacks, slowUpdateLog, telegramRetry } from './reliability.js';
import { createOrderService } from '../core/orderService.js';
import { createNotifier } from './notify.js';
import { registerOps } from './ops.js';
import { registerCustomer } from './customer.js';
import { createInsights } from './insights.js';
import { registerReviews } from './reviews.js';
import { t } from '../i18n.js';

export function createBot({ config, store, botInfo, now }) {
  const bot = new Bot(config.botToken, botInfo ? { botInfo } : undefined);
  const service = createOrderService({ store, config, now });
  const notify = createNotifier({ api: bot.api, store, config });
  const insights = createInsights({ store, config });
  const deps = { store, service, config, notify, insights };

  bot.api.config.use(telegramRetry());

  // one update at a time per chat, many chats in parallel
  bot.use(sequentialize(chatKey));
  bot.use(slowUpdateLog());
  bot.use(autoAnswerCallbacks());
  bot.use(
    session({
      initial: () => ({ lang: null, step: null, cart: null, checkout: null, merchantPriceFor: null }),
    })
  );

  // Remember the customer's language across bot restarts
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type === 'private' && !ctx.session.lang && ctx.from) {
      const c = await store.getCustomer(ctx.from.id).catch(() => null);
      if (c?.lang) ctx.session.lang = c.lang;
    }
    return next();
  });

  registerOps(bot, deps); // first: merchant price input must win over customer text handling
  registerReviews(bot, deps); // before customer: it catches the review comment text
  registerCustomer(bot, deps);

  bot.catch(async (err) => {
    console.error(`Error on update ${err.ctx?.update?.update_id}:`, err.error);
    try {
      const lang = err.ctx?.session?.lang || 'en';
      if (err.ctx?.callbackQuery) {
        try {
          await err.ctx.answerCallbackQuery({ text: t(lang, 'error'), show_alert: true });
          return;
        } catch {
          /* already answered (e.g. with ⏳) or expired: fall back to a message */
        }
      }
      if (err.ctx?.chat?.type === 'private') await err.ctx.reply(t(lang, 'error'));
    } catch {
      /* ignore */
    }
  });

  return { bot, service, notify };
}
