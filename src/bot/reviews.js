// After delivery: food stars (1-5) -> rider 👍/👎 -> optional comment.
// Only the customer of a DELIVERED order can review it, and only once.
import { InlineKeyboard } from 'grammy';
import { t, allTexts } from '../i18n.js';
import { STATUS, OrderError, cleanText, localTimestamp } from '../core/orders.js';
import { withLock } from '../core/lock.js';
import { mainMenu } from './ui.js';
import { replyError, stampMessage } from './notify.js';

export const stars = (n) => '⭐'.repeat(n) + '☆'.repeat(5 - n);

export function ratingKeyboard(orderId) {
  const kb = new InlineKeyboard();
  for (let n = 1; n <= 5; n++) kb.text(`${n}⭐`, `rf:${orderId}:${n}`);
  return kb;
}

const MENU_KEYS = ['btnOrder', 'btnMyOrders', 'btnHelp', 'btnLang'];

export function registerReviews(bot, { store, service, notify, insights }) {
  const pm = bot.chatType('private');
  const L = (ctx) => ctx.session.lang || 'en';

  async function ownDeliveredOrder(ctx, orderId) {
    const order = await service.load(orderId);
    if (order.customerId !== String(ctx.from.id)) throw new OrderError('FORBIDDEN');
    if (order.status !== STATUS.DELIVERED) throw new OrderError('BAD_TRANSITION');
    return order;
  }

  pm.callbackQuery(/^rf:(.+):([1-5])$/, async (ctx) => {
    const lang = L(ctx);
    const [, orderId, n] = ctx.match;
    const foodStars = Number(n);
    try {
      const order = await ownDeliveredOrder(ctx, orderId);
      const created = await withLock(`review:${orderId}`, async () => {
        if (await store.getReview(orderId)) return null;
        return store.createReview({
          orderId,
          createdAt: localTimestamp(),
          merchantId: order.merchantId,
          merchantName: order.merchantName,
          foodStars,
          riderThumb: '',
          comment: '',
          riderId: order.riderId,
          riderName: order.riderName,
          customerId: order.customerId,
        });
      });
      if (!created) return ctx.answerCallbackQuery({ text: t(lang, 'alreadyReviewed'), show_alert: true });
      insights.invalidateRating(order.merchantId);
      await ctx.answerCallbackQuery();
      await stampMessage(ctx, stars(foodStars));
      if (foodStars <= 2) {
        await notify.dispatch(`⚠️ Low food rating ${stars(foodStars)} · ${orderId} · ${order.merchantName}`);
      }
      if (order.riderId) {
        const kb = new InlineKeyboard()
          .text(t(lang, 'btnThumbUp'), `rr:${orderId}:up`)
          .text(t(lang, 'btnThumbDown'), `rr:${orderId}:down`);
        return ctx.reply(t(lang, 'rateRider', { rider: order.riderName }), { reply_markup: kb });
      }
      return askComment(ctx, orderId);
    } catch (err) {
      return replyError(ctx, err, lang);
    }
  });

  pm.callbackQuery(/^rr:(.+):(up|down)$/, async (ctx) => {
    const lang = L(ctx);
    const [, orderId, thumb] = ctx.match;
    try {
      const order = await ownDeliveredOrder(ctx, orderId);
      const updated = await withLock(`review:${orderId}`, async () => {
        const r = await store.getReview(orderId);
        if (!r || r.riderThumb) return null;
        return store.updateReview(orderId, { riderThumb: thumb });
      });
      if (!updated) return ctx.answerCallbackQuery({ text: t(lang, 'alreadyReviewed'), show_alert: true });
      await ctx.answerCallbackQuery();
      await stampMessage(ctx, thumb === 'up' ? '👍' : '👎');
      if (thumb === 'down') await notify.dispatch(`⚠️ Rider ${order.riderName} got 👎 on ${orderId}`);
      return askComment(ctx, orderId);
    } catch (err) {
      return replyError(ctx, err, lang);
    }
  });

  function askComment(ctx, orderId) {
    ctx.session.step = 'review_comment';
    ctx.session.reviewOrderId = orderId;
    const kb = new InlineKeyboard().text(t(L(ctx), 'btnSkip'), `rvskip:${orderId}`);
    return ctx.reply(t(L(ctx), 'askComment'), { reply_markup: kb });
  }

  /** Save comment (if any), thank the customer, tell the shop. */
  async function finish(ctx, orderId, comment, { thank = true } = {}) {
    const lang = L(ctx);
    ctx.session.step = null;
    ctx.session.reviewOrderId = null;
    let review = await store.getReview(orderId);
    if (!review || review.customerId !== String(ctx.from.id)) return;
    if (comment && !review.comment) review = await store.updateReview(orderId, { comment });
    if (thank) await ctx.reply(t(lang, 'reviewThanks'), { reply_markup: mainMenu(lang) });
    const merchant = await store.getMerchant(review.merchantId);
    if (merchant) {
      await notify.toMerchant(merchant, 'mNewReview', {
        id: orderId,
        stars: stars(review.foodStars),
        comment: review.comment ? `"${review.comment}"` : '',
      });
    }
    if (review.comment && (review.foodStars <= 2 || review.riderThumb === 'down')) {
      await notify.dispatch(`💬 ${orderId}: "${review.comment}"`);
    }
  }

  pm.callbackQuery(/^rvskip:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    if (ctx.session.reviewOrderId !== ctx.match[1]) return; // old button
    await stampMessage(ctx, '⏭');
    return finish(ctx, ctx.match[1], '');
  });

  const menuTexts = new Set(MENU_KEYS.flatMap((k) => allTexts(k)));
  pm.on('message:text', async (ctx, next) => {
    if (ctx.session.step !== 'review_comment') return next();
    const text = ctx.message.text;
    // They moved on (menu button or command): close the review quietly, then handle it normally
    if (text.startsWith('/') || menuTexts.has(text)) {
      await finish(ctx, ctx.session.reviewOrderId, '', { thank: false });
      return next();
    }
    return finish(ctx, ctx.session.reviewOrderId, cleanText(text, 300));
  });
}
