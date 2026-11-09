// Merchant, rider and admin actions.
import { InlineKeyboard } from 'grammy';
import { t } from '../i18n.js';
import { th, HTML } from './html.js';
import {
  STATUS,
  OrderError,
  FINAL,
  parseAmount,
  formatMoney,
  localTimestamp,
  localDate,
  platformEarnings,
  calcRiderPay,
} from '../core/orders.js';
import { merchantGuard, riderGuard } from '../core/orderService.js';
import { estimateRide } from '../core/eta.js';
import { merchantAccountsHtml, customerFees, distanceText } from './ui.js';
import { replyError, stampMessage } from './notify.js';
import { ratingKeyboard } from './reviews.js';

export function registerOps(bot, { store, service, config, notify, insights, tracker }) {
  const isAdmin = (userId) => config.adminIds.includes(String(userId));

  /**
   * Who is acting for the shop of this order? The shop's own Telegram account, or an admin
   * (so you can run shops that are not on Telegram yet, from the dispatch group).
   */
  async function resolveMerchantActor(ctx, orderId) {
    const order = await service.load(orderId);
    const merchant = await store.getMerchant(order.merchantId);
    const own = merchant?.telegramId && merchant.telegramId === String(ctx.from.id);
    if (!own && !isAdmin(ctx.from.id)) throw new OrderError('FORBIDDEN');
    const lang = own ? merchant.lang || 'en' : 'en';
    return { order, merchant, lang };
  }

  async function actorLang(ctx) {
    const m = await store.getMerchantByTelegramId(ctx.from.id);
    if (m) return m.lang || 'en';
    const r = await store.getRider(ctx.from.id);
    if (r) return r.lang || 'en';
    return ctx.session?.lang || 'en';
  }

  async function guarded(ctx, fn) {
    try {
      return await fn();
    } catch (err) {
      return replyError(ctx, err, await actorLang(ctx));
    }
  }

  // ===================== MERCHANT =====================

  async function doAccept(ctx, orderId, finalFoodTotal) {
    const { merchant, lang } = await resolveMerchantActor(ctx, orderId);
    const order = await service.accept(orderId, merchant.id, finalFoodTotal);
    const cLang = order.customerLang;
    const payText = th(
      cLang,
      'payNow',
      {
        merchant: merchant.names[cLang] || merchant.names.en,
        food: formatMoney(order.foodTotal),
        accounts: merchantAccountsHtml(merchant, cLang),
        tapToCopy: t(cLang, 'payTapToCopy'),
        fees: customerFees(order),
      },
      { raw: ['accounts'] }
    );
    const payKb = new InlineKeyboard()
      .text(t(cLang, 'btnWhereRef'), `payhelp:${order.id}`)
      .row()
      .text(t(cLang, 'btnCallShop'), `callshop:${order.id}`)
      .text(t(cLang, 'btnCancelOrder'), `ccancel:${order.id}`);
    await notify.send(order.customerId, payText, { ...HTML, reply_markup: payKb });
    await ctx.reply(t(lang, 'mAccepted', { food: formatMoney(order.foodTotal) }));
    await notify.dispatch(`✅ ${order.id} accepted by ${merchant.names.en} · food ${formatMoney(order.foodTotal)}`);
    // The payment message above is this stage's headline; the card (maybe a first render) comes
    // last and is not awaited, so the shop's chat is not held up by it.
    void tracker.update(order, { headline: null });
  }

  bot.callbackQuery(/^macc:(.+)$/, (ctx) =>
    guarded(ctx, async () => {
      const { order, lang } = await resolveMerchantActor(ctx, ctx.match[1]);
      if (order.status !== STATUS.PLACED) throw new OrderError('BAD_TRANSITION');
      await ctx.answerCallbackQuery();
      if (order.customRequest) {
        // Shop must tell us the final price for the special request
        ctx.session.merchantPriceFor = { orderId: order.id, userId: String(ctx.from.id) };
        await stampMessage(ctx, '⏳');
        return ctx.reply(t(lang, 'mAskPrice', { id: order.id }), {
          reply_markup: { force_reply: true, selective: true },
        });
      }
      await stampMessage(ctx, t(lang, 'btnAccept'));
      return doAccept(ctx, order.id, null);
    })
  );

  // Price typed by the shop (works in private chat, or as a reply in the dispatch group)
  bot.on('message:text', async (ctx, next) => {
    const pending = ctx.session.merchantPriceFor;
    if (!pending || pending.userId !== String(ctx.from.id)) return next();
    const lang = await actorLang(ctx);
    const amount = parseAmount(ctx.message.text);
    if (amount == null) return ctx.reply(t(lang, 'mBadPrice'));
    ctx.session.merchantPriceFor = null;
    return guarded(ctx, () => doAccept(ctx, pending.orderId, amount));
  });

  bot.callbackQuery(/^mrej:(.+)$/, (ctx) =>
    guarded(ctx, async () => {
      const { merchant, lang } = await resolveMerchantActor(ctx, ctx.match[1]);
      const order = await service.transition(ctx.match[1], STATUS.REJECTED, {}, merchantGuard(merchant.id));
      await ctx.answerCallbackQuery();
      await stampMessage(ctx, t(lang, 'mRejectedAck'));
      await notify.dispatch(`🚫 ${order.id} rejected by ${merchant.names.en}`);
      void tracker.close(order, th(order.customerLang, 'orderRejected', { id: order.id, merchant: merchant.names[order.customerLang] }));
    })
  );

  bot.callbackQuery(/^mpay:(.+)$/, (ctx) =>
    guarded(ctx, async () => {
      const { merchant, lang } = await resolveMerchantActor(ctx, ctx.match[1]);
      const before = await service.load(ctx.match[1]);
      const eta = await insights.eta(merchant, before.distanceKm);
      const order = await service.transition(
        ctx.match[1],
        STATUS.CONFIRMED,
        { etaMin: eta.min, etaMax: eta.max },
        merchantGuard(merchant.id)
      );
      await ctx.answerCallbackQuery();
      await stampMessage(ctx, t(lang, 'btnPaid'));

      const readyKb = new InlineKeyboard().text(t(merchant.lang || 'en', 'btnReady'), `mready:${order.id}`);
      await notify.toMerchant(merchant, 'mStartPreparing', { id: order.id }, { other: { reply_markup: readyKb }, fallback: true });

      // Post the job for riders
      const riderPayPreview = calcRiderPay(order.deliveryFee, config.riderSharePct);
      await notify.dispatch(
        [
          `🚲 New delivery ${order.id}`,
          `📦 Pickup: ${merchant.names.en}`,
          `🏠 Drop: ${order.landmark}${distanceText(order.distanceKm)}`,
          `💵 Rider pay: ${formatMoney(riderPayPreview)}`,
        ].join('\n'),
        { reply_markup: new InlineKeyboard().text("🚲 I'll take it", `take:${order.id}`) }
      );
      // The customer's card last and not awaited: a slow render must not hold up the shop or riders
      void tracker.update(order, { headline: th(order.customerLang, 'hlPaid', { id: order.id, ...eta }) });
    })
  );

  bot.callbackQuery(/^mnopay:(.+)$/, (ctx) =>
    guarded(ctx, async () => {
      const { merchant, lang } = await resolveMerchantActor(ctx, ctx.match[1]);
      const before = await service.load(ctx.match[1]);
      const order = await service.transition(ctx.match[1], STATUS.ACCEPTED, { paymentRef: '' }, merchantGuard(merchant.id));
      await ctx.answerCallbackQuery();
      await stampMessage(ctx, t(lang, 'mNotPaidAck'));
      await notify.toCustomer(order, 'payNotFound');
      await notify.dispatch(`⚠️ ${order.id}: ${merchant.names.en} says payment NOT received (ref ${before.paymentRef}). Watch for fake payments.`);
    })
  );

  bot.callbackQuery(/^mready:(.+)$/, (ctx) =>
    guarded(ctx, async () => {
      const { merchant, lang } = await resolveMerchantActor(ctx, ctx.match[1]);
      const order = await service.transition(ctx.match[1], STATUS.READY, {}, merchantGuard(merchant.id));
      await ctx.answerCallbackQuery();
      await stampMessage(ctx, t(lang, 'mReadyAck'));
      await notify.toRider(order, 'rReady', { merchant: merchant.names.en });
    })
  );

  // ===================== RIDER =====================

  bot.callbackQuery(/^take:(.+)$/, async (ctx) => {
    const rider = await store.getRider(ctx.from.id);
    const lang = rider?.lang || 'en';
    if (!rider || !rider.active) {
      return ctx.answerCallbackQuery({ text: t(lang, 'rNotRider'), show_alert: true });
    }
    let order;
    try {
      order = await service.assignRider(ctx.match[1], rider);
    } catch (err) {
      return replyError(ctx, err, lang);
    }
    const merchant = await store.getMerchant(order.merchantId);
    const kb = new InlineKeyboard().text(t(lang, 'btnPickedUp'), `rpick:${order.id}`);
    const sent = await notify.send(
      rider.telegramId,
      t(lang, 'rAssigned', {
        id: order.id,
        merchant: merchant.names.en,
        mphone: merchant.phone,
        landmark: order.landmark,
        distance: distanceText(order.distanceKm),
        cname: order.customerName,
        cphone: order.customerPhone,
        fees: customerFees(order),
        pay: formatMoney(order.riderPay),
      }),
      { reply_markup: kb }
    );
    if (!sent) {
      // Telegram bots can't message someone who never pressed Start: undo and tell the rider
      await service.unassignRider(order.id, rider.telegramId);
      return ctx.answerCallbackQuery({ text: t(lang, 'rStartBot'), show_alert: true });
    }
    await ctx.answerCallbackQuery({ text: '✅' });
    if (Number.isFinite(order.lat) && Number.isFinite(order.lng)) {
      await ctx.api.sendLocation(rider.telegramId, order.lat, order.lng).catch(() => {});
    }
    await stampMessage(ctx, `✅ Taken by ${rider.name}`);
    await notify.toMerchant(merchant, 'mRiderComing', { id: order.id, rider: rider.name, phone: rider.phone });
    void tracker.update(order, {
      headline: th(order.customerLang, 'hlRider', { id: order.id, rider: rider.name, phone: rider.phone }),
    });
  });

  bot.callbackQuery(/^rpick:(.+)$/, (ctx) =>
    guarded(ctx, async () => {
      const order = await service.transition(ctx.match[1], STATUS.PICKED_UP, {}, riderGuard(ctx.from.id));
      const lang = await actorLang(ctx);
      await ctx.answerCallbackQuery({ text: t(lang, 'rOnTheWayAck'), show_alert: true });
      await stampMessage(
        ctx,
        t(lang, 'btnPickedUp'),
        new InlineKeyboard().text(t(lang, 'btnDelivered'), `rdone:${order.id}`)
      );
      const merchant = await store.getMerchant(order.merchantId);
      await notify.toMerchant(merchant, 'mPickedUp', { id: order.id });
      const ride = estimateRide(order.distanceKm, config);
      void tracker.update(order, {
        headline: th(order.customerLang, 'hlComing', { id: order.id, fees: customerFees(order), ...ride }),
      });
    })
  );

  bot.callbackQuery(/^rdone:(.+)$/, (ctx) =>
    guarded(ctx, async () => {
      const order = await service.transition(
        ctx.match[1],
        STATUS.DELIVERED,
        { deliveredAt: localTimestamp() },
        riderGuard(ctx.from.id)
      );
      const lang = await actorLang(ctx);
      await ctx.answerCallbackQuery();
      await stampMessage(ctx, t(lang, 'rDeliveredAck', { id: order.id, pay: formatMoney(order.riderPay) }));
      // Awaited: the delivered card comes before the rating question
      await tracker.update(order, { headline: th(order.customerLang, 'hlDone', { id: order.id }) });
      // Ask for a rating right away while the food is fresh in their mind
      const shop = await store.getMerchant(order.merchantId);
      await notify.send(
        order.customerId,
        t(order.customerLang, 'rateFood', { merchant: shop?.names[order.customerLang] || order.merchantName }),
        { reply_markup: ratingKeyboard(order.id) }
      );
      await notify.dispatch(
        `✅ ${order.id} delivered by ${order.riderName} · you earned ${formatMoney(platformEarnings(order))}`
      );
    })
  );

  // ===================== ADMIN =====================

  async function adminCancel(ctx, orderId) {
    const order = await service.transition(orderId, STATUS.CANCELLED);
    const merchant = await store.getMerchant(order.merchantId);
    if (merchant) await notify.toMerchant(merchant, 'mCancelled', { id: order.id });
    await notify.toRider(order, 'rCancelled');
    void tracker.close(order, th(order.customerLang, 'orderCancelled', { id: order.id }));
    return order;
  }

  bot.callbackQuery(/^acancel:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery({ text: t('en', 'notAllowed'), show_alert: true });
    try {
      await adminCancel(ctx, ctx.match[1]);
    } catch (err) {
      return replyError(ctx, err, 'en');
    }
    await ctx.answerCallbackQuery();
    return stampMessage(ctx, `❌ Cancelled by ${ctx.from.first_name}`);
  });

  bot.command('myid', (ctx) =>
    ctx.reply(`Your Telegram ID: ${ctx.from.id}\nThis chat ID: ${ctx.chat.id}`)
  );

  const adminOnly = (fn) => async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.reply(t('en', 'notAllowed'));
    return fn(ctx);
  };

  bot.command(
    'cancel',
    adminOnly(async (ctx) => {
      const id = (ctx.match || '').trim().toUpperCase();
      if (!id) return ctx.reply('Usage: /cancel 261105-ABCD');
      try {
        await adminCancel(ctx, id);
      } catch (err) {
        return replyError(ctx, err, 'en');
      }
      return ctx.reply(`❌ ${id} cancelled`);
    })
  );

  bot.command(
    'today',
    adminOnly(async (ctx) => {
      const orders = await store.listOrders({ datePrefix: localDate() });
      const delivered = orders.filter((o) => o.status === STATUS.DELIVERED);
      const sum = (f) => delivered.reduce((s, o) => s + (Number.isFinite(o[f]) ? o[f] : 0), 0);
      const count = (s) => orders.filter((o) => o.status === s).length;
      const active = orders.filter((o) => !FINAL.has(o.status)).length;
      const todaysReviews = (await store.listReviews()).filter((r) => r.createdAt.startsWith(localDate()));
      const rated = todaysReviews.filter((r) => Number.isFinite(r.foodStars));
      const ups = todaysReviews.filter((r) => r.riderThumb === 'up').length;
      const downs = todaysReviews.filter((r) => r.riderThumb === 'down').length;
      const reviewStats = rated.length
        ? ['', `⭐ Food rating: ${(rated.reduce((s, r) => s + r.foodStars, 0) / rated.length).toFixed(1)} (${rated.length} reviews)`, `🚲 Riders: ${ups} 👍 · ${downs} 👎`]
        : [];
      const net = delivered.reduce((s, o) => s + platformEarnings(o), 0);
      return ctx.reply(
        [
          `📊 Today (${localDate()})`,
          `Orders: ${orders.length} · delivered ${delivered.length} · active ${active}`,
          `Rejected ${count(STATUS.REJECTED)} · cancelled ${count(STATUS.CANCELLED)}`,
          '',
          `Food sold (to shops): ${formatMoney(sum('foodTotal'))}`,
          `Commission (invoice monthly): ${formatMoney(sum('commission'))}`,
          `Delivery fees: ${formatMoney(sum('deliveryFee'))}`,
          `Service fees: ${formatMoney(sum('serviceFee'))}`,
          `Rider pay: −${formatMoney(sum('riderPay'))}`,
          '',
          `💰 You earned: ${formatMoney(net)}`,
          ...reviewStats,
        ].join('\n')
      );
    })
  );

  bot.command(
    'active',
    adminOnly(async (ctx) => {
      const orders = (await store.listOrders()).filter((o) => !FINAL.has(o.status));
      if (orders.length === 0) return ctx.reply('No active orders 😴');
      return ctx.reply(
        orders
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((o) => `${o.id} · ${o.merchantName} · ${o.status}${o.riderName ? ` · 🚲 ${o.riderName}` : ''} · ${o.createdAt.slice(11, 16)}`)
          .join('\n')
      );
    })
  );

  bot.command(
    'reload',
    adminOnly(async (ctx) => {
      store.clearCache();
      return ctx.reply('🔄 Merchants, menu and riders reloaded from the sheet.');
    })
  );
}
