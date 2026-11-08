// Customer flow: language -> shop -> items -> location -> landmark -> phone -> confirm -> pay ref.
import { InlineKeyboard, Keyboard } from 'grammy';
import { t, allTexts, statusLabel } from '../i18n.js';
import {
  STATUS,
  CUSTOMER_CANCELLABLE,
  summarizeCart,
  roadDistanceKm,
  calcDeliveryFee,
  normalizePhone,
  normalizeRef,
  cleanText,
  formatMoney,
  localTimestamp,
  parseLatLng,
} from '../core/orders.js';
import { customerGuard } from '../core/orderService.js';
import {
  mainMenu,
  homeInline,
  langKeyboard,
  merchantsKeyboard,
  renderMenu,
  renderSummary,
  merchantAccounts,
  itemLines,
  foodText,
  distanceText,
} from './ui.js';
import { replyError, stampMessage } from './notify.js';

const L = (ctx) => ctx.session.lang || 'en';

export function registerCustomer(bot, { store, service, config, notify, insights }) {
  const pm = bot.chatType('private');

  // ---------- helpers ----------
  async function openMerchants() {
    return (await store.getMerchants()).filter((m) => m.active);
  }
  async function activeMenu(merchantId) {
    return (await store.getMenu(merchantId)).filter((i) => i.active && Number.isFinite(i.price));
  }
  function resetFlow(ctx) {
    ctx.session.step = null;
    ctx.session.cart = null;
    ctx.session.checkout = null;
  }
  async function showHome(ctx) {
    const lang = L(ctx);
    // reply keyboard = handy buttons at the bottom on phones; inline buttons = always visible (also on desktop)
    await ctx.reply(t(lang, 'welcome', { brand: config.brandName }), { reply_markup: mainMenu(lang) });
    await ctx.reply(t(lang, 'useMenu'), { reply_markup: homeInline(lang) });
  }
  function useMenu(ctx) {
    return ctx.reply(t(L(ctx), 'useMenu'), { reply_markup: homeInline(L(ctx)) });
  }
  async function editOrReply(ctx, text, reply_markup) {
    if (ctx.callbackQuery?.message) {
      try {
        return await ctx.editMessageText(text, { reply_markup });
      } catch (err) {
        if (String(err.description || '').includes('not modified')) return;
      }
    }
    return ctx.reply(text, { reply_markup });
  }
  async function showMerchants(ctx) {
    const lang = L(ctx);
    const merchants = await openMerchants();
    if (merchants.length === 0) return ctx.reply(t(lang, 'noMerchants'));
    const ratings = new Map(await Promise.all(merchants.map(async (m) => [m.id, await insights.rating(m.id)])));
    return editOrReply(ctx, t(lang, 'chooseMerchant'), merchantsKeyboard(merchants, lang, ratings));
  }
  async function showMenu(ctx, { asNewMessage = false } = {}) {
    const lang = L(ctx);
    const cart = ctx.session.cart;
    const merchant = await store.getMerchant(cart.merchantId);
    const menu = await activeMenu(cart.merchantId);
    const eta = await insights.eta(merchant, null);
    const { text, keyboard } = renderMenu({ merchant, menu, cart, lang, eta });
    if (asNewMessage) return ctx.reply(text, { reply_markup: keyboard });
    return editOrReply(ctx, text, keyboard);
  }
  async function stale(ctx) {
    return ctx.answerCallbackQuery({ text: t(L(ctx), 'staleButton'), show_alert: true });
  }
  function customerName(from) {
    return cleanText([from.first_name, from.last_name].filter(Boolean).join(' '), 60) || 'Customer';
  }

  // ---------- start & language ----------
  pm.command('start', async (ctx) => {
    resetFlow(ctx);
    if (!ctx.session.lang) {
      return ctx.reply(`${t('om', 'chooseLang')}\n${t('am', 'chooseLang')}\n${t('en', 'chooseLang')}`, {
        reply_markup: langKeyboard(),
      });
    }
    return showHome(ctx);
  });

  pm.callbackQuery(/^lang:(om|am|en)$/, async (ctx) => {
    ctx.session.lang = ctx.match[1];
    await ctx.answerCallbackQuery();
    await store.saveCustomer({
      id: String(ctx.from.id),
      name: customerName(ctx.from),
      lang: ctx.session.lang,
      ...(await store.getCustomer(ctx.from.id) ? {} : { createdAt: localTimestamp() }),
    });
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => {});
    return showHome(ctx);
  });

  const showLang = (ctx) => ctx.reply(t(L(ctx), 'chooseLang'), { reply_markup: langKeyboard() });
  const showHelp = (ctx) => ctx.reply(t(L(ctx), 'helpText', { phone: config.supportPhone }), { reply_markup: homeInline(L(ctx)) });
  pm.hears(allTexts('btnLang'), showLang);
  pm.command('help', showHelp);
  pm.hears(allTexts('btnHelp'), showHelp);
  pm.command('menu', (ctx) => { resetFlow(ctx); return showHome(ctx); });

  // inline main menu buttons
  pm.callbackQuery(/^menu:(order|orders|help|lang)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const what = ctx.match[1];
    if (what === 'order') { resetFlow(ctx); return showMerchants(ctx); }
    if (what === 'orders') return showMyOrders(ctx);
    if (what === 'help') return showHelp(ctx);
    return showLang(ctx);
  });

  // ---------- browsing ----------
  pm.hears(allTexts('btnOrder'), async (ctx) => {
    resetFlow(ctx);
    return showMerchants(ctx);
  });

  pm.callbackQuery('back', async (ctx) => {
    await ctx.answerCallbackQuery();
    resetFlow(ctx);
    return showMerchants(ctx);
  });

  pm.callbackQuery(/^m:(.+)$/, async (ctx) => {
    const merchant = await store.getMerchant(ctx.match[1]);
    if (!merchant || !merchant.active) return stale(ctx);
    await ctx.answerCallbackQuery();
    ctx.session.cart = { merchantId: merchant.id, items: {}, custom: null };
    ctx.session.checkout = null;
    ctx.session.step = 'browsing';
    return showMenu(ctx);
  });

  pm.callbackQuery(/^(add|rem):(.+)$/, async (ctx) => {
    const [, op, itemId] = ctx.match;
    const cart = ctx.session.cart;
    if (!cart) return stale(ctx);
    const menu = await activeMenu(cart.merchantId);
    if (!menu.some((i) => i.id === itemId)) return stale(ctx);
    const qty = cart.items[itemId] || 0;
    if (op === 'add') cart.items[itemId] = Math.min(qty + 1, 20);
    else if (qty <= 1) delete cart.items[itemId];
    else cart.items[itemId] = qty - 1;
    ctx.session.step = 'browsing';
    await ctx.answerCallbackQuery();
    return showMenu(ctx);
  });

  pm.callbackQuery('clear', async (ctx) => {
    if (!ctx.session.cart) return stale(ctx);
    ctx.session.cart.items = {};
    ctx.session.cart.custom = null;
    await ctx.answerCallbackQuery();
    return showMenu(ctx);
  });

  pm.callbackQuery('custom', async (ctx) => {
    if (!ctx.session.cart) return stale(ctx);
    ctx.session.step = 'custom_text';
    await ctx.answerCallbackQuery();
    return ctx.reply(t(L(ctx), 'askCustom'));
  });

  pm.callbackQuery('checkout', async (ctx) => {
    const lang = L(ctx);
    const cart = ctx.session.cart;
    if (!cart) return stale(ctx);
    const menu = await activeMenu(cart.merchantId);
    const summary = summarizeCart(cart, new Map(menu.map((i) => [i.id, i])), lang);
    if (summary.isEmpty) return ctx.answerCallbackQuery({ text: t(lang, 'cartEmptyWarn'), show_alert: true });
    await ctx.answerCallbackQuery();
    ctx.session.step = 'location';
    return askLocation(ctx);
  });

  async function askLocation(ctx) {
    const lang = L(ctx);
    const kb = new Keyboard()
      .requestLocation(t(lang, 'btnShareLocation'))
      .row()
      .text(t(lang, 'btnSkip'))
      .resized()
      .oneTime();
    await ctx.reply(t(lang, 'askLocation'), { reply_markup: kb });
    // Telegram Desktop can't share GPS and often hides reply buttons: give an inline Skip + paste option
    return ctx.reply(t(lang, 'locDesktopHint'), {
      reply_markup: new InlineKeyboard().text(t(lang, 'btnSkip'), 'skiploc'),
    });
  }

  pm.callbackQuery('skiploc', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (ctx.session.step !== 'location' || !ctx.session.cart) return;
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } }).catch(() => {});
    return setLocation(ctx, null, null);
  });

  // ---------- checkout steps ----------
  pm.on('message:location', async (ctx) => {
    if (ctx.session.step !== 'location' || !ctx.session.cart) return useMenu(ctx);
    const { latitude: lat, longitude: lng } = ctx.message.location;
    return setLocation(ctx, lat, lng);
  });

  async function setLocation(ctx, lat, lng) {
    const lang = L(ctx);
    const merchant = await store.getMerchant(ctx.session.cart.merchantId);
    const distanceKm =
      lat == null ? null : roadDistanceKm({ lat: merchant.lat, lng: merchant.lng }, { lat, lng }, config.roadFactor);
    const { fee, outOfRange } = calcDeliveryFee(distanceKm, config);
    if (outOfRange) {
      resetFlow(ctx);
      return ctx.reply(t(lang, 'outOfRange', { km: distanceKm, max: config.maxKm }), {
        reply_markup: mainMenu(lang),
      });
    }
    ctx.session.checkout = { lat, lng, distanceKm, deliveryFee: fee };
    ctx.session.step = 'landmark';
    return ctx.reply(t(lang, 'askLandmark'), { reply_markup: { remove_keyboard: true } });
  }

  pm.on('message:contact', async (ctx) => {
    if (ctx.session.step !== 'phone') return useMenu(ctx);
    return setPhone(ctx, ctx.message.contact.phone_number);
  });

  async function setPhone(ctx, raw) {
    const lang = L(ctx);
    const phone = normalizePhone(raw);
    if (!phone) return ctx.reply(t(lang, 'badPhone'));
    ctx.session.checkout.phone = phone;
    ctx.session.step = 'confirm';
    const cart = ctx.session.cart;
    const merchant = await store.getMerchant(cart.merchantId);
    const menu = await activeMenu(cart.merchantId);
    const summary = summarizeCart(cart, new Map(menu.map((i) => [i.id, i])), lang);
    const eta = await insights.eta(merchant, ctx.session.checkout.distanceKm);
    const text = renderSummary({ merchant, summary, checkout: ctx.session.checkout, serviceFee: config.serviceFee, lang, eta });
    const kb = new InlineKeyboard().text(t(lang, 'btnConfirm'), 'confirm').row().text(t(lang, 'btnCancel'), 'cancelcart');
    await ctx.reply('👍', { reply_markup: { remove_keyboard: true } });
    return ctx.reply(text, { reply_markup: kb });
  }

  pm.callbackQuery('cancelcart', async (ctx) => {
    resetFlow(ctx);
    await ctx.answerCallbackQuery();
    await stampMessage(ctx, t(L(ctx), 'cartCancelled'));
    return useMenu(ctx);
  });

  pm.callbackQuery('confirm', async (ctx) => {
    const lang = L(ctx);
    const { cart, checkout, step } = ctx.session;
    if (step !== 'confirm' || !cart || !checkout?.phone) return stale(ctx);
    const merchant = await store.getMerchant(cart.merchantId);
    if (!merchant?.active) return stale(ctx);
    const menu = await activeMenu(cart.merchantId);
    const menuById = new Map(menu.map((i) => [i.id, i]));
    const summary = summarizeCart(cart, menuById, lang);
    if (summary.isEmpty) return stale(ctx);
    await ctx.answerCallbackQuery();

    const customer = { id: ctx.from.id, name: customerName(ctx.from), lang };
    const order = await service.placeOrder({ customer, merchant, summary, checkout });
    await store.saveCustomer({ id: String(ctx.from.id), name: customer.name, phone: checkout.phone, lang });
    resetFlow(ctx);

    await stampMessage(ctx, `📨 ${order.id}`);
    await ctx.reply(t(lang, 'orderPlaced', { id: order.id, merchant: merchant.names[lang] }), {
      reply_markup: mainMenu(lang),
    });

    // Notify the shop (in the shop's language) with Accept / Reject
    const mLang = merchant.lang || 'en';
    const mSummary = summarizeCart(cart, menuById, mLang);
    const kb = new InlineKeyboard()
      .text(t(mLang, 'btnAccept'), `macc:${order.id}`)
      .text(t(mLang, 'btnReject'), `mrej:${order.id}`);
    await notify.toMerchant(
      merchant,
      'mNewOrder',
      { id: order.id, items: itemLines(mSummary, mLang), food: foodText(mSummary, mLang, true), landmark: order.landmark },
      { other: { reply_markup: kb }, fallback: true }
    );

    // Tell the dispatch group
    await notify.dispatch(
      [
        `🆕 ${order.id} · ${merchant.names.en}`,
        itemLines(summarizeCart(cart, menuById, 'en'), 'en'),
        `👤 ${order.customerName} ${order.customerPhone}`,
        `🏠 ${order.landmark}${distanceText(order.distanceKm)}`,
        `🚲 ${formatMoney(order.deliveryFee)} + ${formatMoney(order.serviceFee)} service`,
      ].join('\n'),
      { reply_markup: new InlineKeyboard().text('❌ Cancel (admin)', `acancel:${order.id}`) }
    );
  });

  // ---------- my orders & cancel ----------
  pm.hears(allTexts('btnMyOrders'), (ctx) => showMyOrders(ctx));

  async function showMyOrders(ctx) {
    const lang = L(ctx);
    const orders = (await store.listOrders({ customerId: ctx.from.id }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5);
    if (orders.length === 0) return ctx.reply(t(lang, 'noOrders'), { reply_markup: homeInline(lang) });
    const kb = new InlineKeyboard();
    const lines = [t(lang, 'myOrdersTitle'), ''];
    for (const o of orders) {
      lines.push(`${o.id} · ${o.merchantName} · ${statusLabel(lang, o.status)}`);
      if (CUSTOMER_CANCELLABLE.has(o.status)) kb.text(`${t(lang, 'btnCancel')} ${o.id}`, `ccancel:${o.id}`).row();
    }
    return ctx.reply(lines.join('\n'), { reply_markup: kb });
  }

  pm.callbackQuery(/^ccancel:(.+)$/, async (ctx) => {
    const lang = L(ctx);
    try {
      const order = await service.transition(ctx.match[1], STATUS.CANCELLED, {}, (o) => {
        customerGuard(ctx.from.id)(o);
        if (!CUSTOMER_CANCELLABLE.has(o.status)) {
          const e = new Error('late');
          e.cantCancel = true;
          throw e;
        }
      });
      await ctx.answerCallbackQuery();
      await stampMessage(ctx, t(lang, 'orderCancelled', { id: order.id }));
      const merchant = await store.getMerchant(order.merchantId);
      if (merchant) await notify.toMerchant(merchant, 'mCancelled', { id: order.id });
      await notify.dispatch(`❌ ${order.id} cancelled by customer`);
    } catch (err) {
      if (err.cantCancel) {
        return ctx.answerCallbackQuery({ text: t(lang, 'cantCancel', { phone: config.supportPhone }), show_alert: true });
      }
      return replyError(ctx, err, lang);
    }
  });

  // ---------- free text (custom request, landmark, phone, payment reference) ----------
  pm.on('message:text', async (ctx) => {
    const lang = L(ctx);
    const text = ctx.message.text;
    if (text.startsWith('/')) return;

    switch (ctx.session.step) {
      case 'custom_text': {
        const custom = cleanText(text, 300);
        if (!custom || !ctx.session.cart) break;
        ctx.session.cart.custom = custom;
        ctx.session.step = 'browsing';
        await ctx.reply(t(lang, 'customSaved'));
        return showMenu(ctx, { asNewMessage: true });
      }
      case 'location': {
        if (allTexts('btnSkip').includes(text)) return setLocation(ctx, null, null);
        const pasted = parseLatLng(text);
        if (pasted) return setLocation(ctx, pasted.lat, pasted.lng);
        return askLocation(ctx);
      }
      case 'landmark': {
        const landmark = cleanText(text, 200);
        if (landmark.length < 3) return ctx.reply(t(lang, 'landmarkTooShort'));
        ctx.session.checkout.landmark = landmark;
        ctx.session.step = 'phone';
        const kb = new Keyboard().requestContact(t(lang, 'btnSharePhone')).resized().oneTime();
        return ctx.reply(t(lang, 'askPhone'), { reply_markup: kb });
      }
      case 'phone':
        return setPhone(ctx, text);
      default:
        break;
    }
    return handlePaymentRef(ctx, text);
  });

  async function handlePaymentRef(ctx, text) {
    const lang = L(ctx);
    const awaiting = (await store.listOrders({ customerId: ctx.from.id, statuses: [STATUS.ACCEPTED] })).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
    if (awaiting.length === 0) return useMenu(ctx);
    const ref = normalizeRef(text);
    if (!ref) return ctx.reply(t(lang, 'badRef'));

    let order;
    try {
      order = await service.submitPayment(awaiting[0].id, ctx.from.id, ref);
    } catch (err) {
      return replyError(ctx, err, lang);
    }
    await ctx.reply(t(lang, 'refReceived'));

    const merchant = await store.getMerchant(order.merchantId);
    const mLang = merchant.lang || 'en';
    const kb = new InlineKeyboard()
      .text(t(mLang, 'btnPaid'), `mpay:${order.id}`)
      .row()
      .text(t(mLang, 'btnNotPaid'), `mnopay:${order.id}`);
    await notify.toMerchant(
      merchant,
      'mCheckPayment',
      { id: order.id, food: formatMoney(order.foodTotal), ref },
      { other: { reply_markup: kb }, fallback: true }
    );
    await notify.dispatch(`💳 ${order.id}: customer sent ref ${ref} for ${formatMoney(order.foodTotal)}`);
  }
}

export { merchantAccounts };
