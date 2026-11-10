import { Bot, session } from 'grammy';
import { sequentialize } from '@grammyjs/runner';
import { chatKey, autoAnswerCallbacks, slowUpdateLog, telegramRetry } from './reliability.js';
import { createOrderService } from '../core/orderService.js';
import { createNotifier } from './notify.js';
import { registerOps } from './ops.js';
import { registerCustomer } from './customer.js';
import { registerPhotos } from './photos.js';
import { createInsights } from './insights.js';
import { registerReviews } from './reviews.js';
import { t, LANGS } from '../i18n.js';
import { createImageCache } from '../render/imageCache.js';
import { bannerSvg, trackerSvg, renderPng } from '../render/cards.js';
import { stageLabels } from '../core/tracker.js';
import { createTracker } from './tracker.js';

/**
 * Picture cards by kind. Cache keys pair with args: 'banner:<lang>' -> { kind: 'banner', lang },
 * 'track:<lang>:<stage>:<eta>' -> { kind: 'tracker', lang, stage, eta }.
 * The SVG is built inside the cache job, so a cached picture costs nothing to send again.
 */
export function renderCard({ kind, lang, stage, eta } = {}) {
  if (kind === 'tracker') {
    return renderPng(trackerSvg({ title: t(lang, `cardTitle${stage}`), eta, stage, labels: stageLabels(lang) }));
  }
  if (kind === 'banner') {
    return renderPng(
      bannerSvg({ slogan: t(lang, 'bannerSlogan'), tagline: t(lang, 'bannerTagline'), cta: t(lang, 'bannerCta') })
    );
  }
  throw new Error(`unknown card kind: ${kind}`);
}

/**
 * images: an image cache (tests pass a fast fake); warmImages: render the welcome banners in
 * the background now, so the first customer doesn't wait for them.
 */
export function createBot({ config, store, botInfo, now, images, warmImages = true }) {
  const bot = new Bot(config.botToken, botInfo ? { botInfo } : undefined);
  const service = createOrderService({ store, config, now });
  images ??= createImageCache({ render: renderCard });
  // png() never rejects: a failed render is logged by the cache and retried on next use
  if (warmImages) for (const lang of LANGS) images.png(`banner:${lang}`, { kind: 'banner', lang });
  const notify = createNotifier({ api: bot.api, store, config, images });
  const insights = createInsights({ store, config });
  const tracker = createTracker({ api: bot.api, store, notify, config, insights });
  const deps = { store, service, config, notify, insights, tracker };

  bot.api.config.use(telegramRetry());

  // one update at a time per chat, many chats in parallel
  bot.use(sequentialize(chatKey));
  bot.use(slowUpdateLog());
  bot.use(autoAnswerCallbacks());
  bot.use(
    session({
      // menuShown: the bottom menu (mainMenu) is the reply keyboard the customer has right now
      initial: () => ({ lang: null, step: null, cart: null, checkout: null, merchantPriceFor: null, menuShown: false }),
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
  registerPhotos(bot, deps); // admins' item photos and shop banners
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

  return { bot, service, notify, tracker };
}
