// Customer flow: language -> shop -> items -> location -> landmark -> phone -> confirm -> pay ref.
import fs from 'node:fs';
import { InlineKeyboard, InputFile, Keyboard } from 'grammy';
import { t, allTexts, statusLabel } from '../i18n.js';
import {
  STATUS,
  OrderError,
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
  itemLines,
  foodText,
  distanceText,
  progressLine,
} from './ui.js';
import { replyError, appendLine } from './notify.js';
import { th, HTML } from './html.js';

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
  /**
   * Send a message that sets or removes the reply keyboard, and remember whether the customer now
   * has the bottom menu. mainMenu is the only persistent keyboard; any other one replaces it.
   */
  function replyKeyboard(ctx, text, reply_markup, other = {}) {
    ctx.session.menuShown = reply_markup?.is_persistent === true;
    return ctx.reply(text, { ...other, reply_markup });
  }
  /**
   * Home screen. The bottom menu (reply keyboard, handy on phones) needs a text message, so a short
   * line carries it, only when the customer doesn't have it already. Then the banner picture with
   * inline buttons (always visible, also on Telegram Desktop); plain text if the picture fails.
   */
  async function showHome(ctx, { justChoseLanguage = false } = {}) {
    const lang = L(ctx);
    if (!ctx.session.menuShown) {
      await replyKeyboard(ctx, t(lang, justChoseLanguage ? 'langSet' : 'homeLine'), mainMenu(lang));
    }
    const caption = th(lang, 'welcomeCaption', { brand: config.brandName });
    const other = { caption, ...HTML, reply_markup: homeInline(lang) };
    const photo = await notify.sendPhotoCached(ctx.chat.id, `banner:${lang}`, { kind: 'banner', lang }, other);
    if (!photo) await ctx.reply(caption, { ...HTML, reply_markup: homeInline(lang) });
  }
  function useMenu(ctx) {
    return ctx.reply(t(L(ctx), 'useMenu'), { reply_markup: homeInline(L(ctx)) });
  }
  async function editOrReply(ctx, text, reply_markup, other = {}) {
    if (ctx.callbackQuery?.message) {
      try {
        return await ctx.editMessageText(text, { ...other, reply_markup });
      } catch (err) {
        if (String(err.description || '').includes('not modified')) return;
      }
    }
    return ctx.reply(text, { ...other, reply_markup });
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
    const [eta, rating] = await Promise.all([insights.eta(merchant, null), insights.rating(merchant.id)]);
    const { text, keyboard } = renderMenu({ merchant, menu, cart, lang, eta, rating });
    if (asNewMessage) return ctx.reply(text, { ...HTML, reply_markup: keyboard });
    return editOrReply(ctx, text, keyboard, HTML);
  }
  async function stale(ctx) {
    await ctx.answerCallbackQuery({ text: t(L(ctx), 'staleButton'), show_alert: true });
    return showHome(ctx);
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
    ctx.session.menuShown = false; // the bottom menu's labels are in the old language: send it again
    return showHome(ctx, { justChoseLanguage: true });
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

  // ---------- checkout steps 2-4: one message each, Back / Cancel in the bottom keyboard ----------
  const STEP_NUMBER = { location: 2, landmark: 3, phone: 4 };
  function withBackCancel(kb, lang) {
    return kb.text(t(lang, 'btnStepBack')).text(t(lang, 'btnStepCancel')).resized();
  }
  function sendStep(ctx, step, key, keyboard) {
    const lang = L(ctx);
    return replyKeyboard(ctx, `${progressLine(lang, STEP_NUMBER[step])}\n${t(lang, key)}`, keyboard, HTML);
  }
  /** Step 2. The computer tip (paste a link / coordinates, or Skip) is part of the same message. */
  function askLocation(ctx) {
    const lang = L(ctx);
    ctx.session.step = 'location';
    const kb = new Keyboard().requestLocation(t(lang, 'btnShareLocation')).row().text(t(lang, 'btnSkip')).row();
    return sendStep(ctx, 'location', 'askLocation', withBackCancel(kb, lang).oneTime());
  }
  function askLandmark(ctx) {
    ctx.session.step = 'landmark';
    return sendStep(ctx, 'landmark', 'askLandmark', withBackCancel(new Keyboard(), L(ctx)));
  }
  function askPhone(ctx) {
    const lang = L(ctx);
    ctx.session.step = 'phone';
    const kb = new Keyboard().requestContact(t(lang, 'btnSharePhone')).row();
    return sendStep(ctx, 'phone', 'askPhone', withBackCancel(kb, lang).oneTime());
  }

  // Inline Skip: no longer sent, kept so the button on older messages still works.
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
      return replyKeyboard(ctx, t(lang, 'outOfRange', { km: distanceKm, max: config.maxKm }), mainMenu(lang));
    }
    ctx.session.checkout = { lat, lng, distanceKm, deliveryFee: fee };
    return askLandmark(ctx);
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
    const kb = new InlineKeyboard()
      .text(t(lang, 'btnConfirm'), 'confirm')
      .row()
      .text(t(lang, 'btnEdit'), 'edit')
      .text(t(lang, 'btnCancel'), 'cancelcart');
    // the step keyboard goes away and the bottom main menu comes back
    await replyKeyboard(ctx, t(lang, 'almostDone'), mainMenu(lang));
    return ctx.reply(text, { ...HTML, reply_markup: kb });
  }

  // Summary -> menu: the cart stays, the checkout details are entered again.
  pm.callbackQuery('edit', async (ctx) => {
    if (!ctx.session.cart) return stale(ctx);
    await ctx.answerCallbackQuery();
    ctx.session.checkout = null;
    ctx.session.step = 'browsing';
    return showMenu(ctx);
  });

  // Bottom-keyboard Back / Cancel. Same text as other buttons in some languages, so they only act
  // during a checkout step; anywhere else the customer is pointed to the menu.
  pm.hears(allTexts('btnStepBack'), async (ctx) => {
    const { step, cart } = ctx.session;
    if (!STEP_NUMBER[step] || !cart) return useMenu(ctx);
    if (step === 'phone') {
      delete ctx.session.checkout.landmark;
      return askLandmark(ctx);
    }
    if (step === 'landmark') {
      ctx.session.checkout = null;
      return askLocation(ctx);
    }
    // location -> menu as a new message; bring the bottom menu back first (the step keyboard replaced it)
    ctx.session.checkout = null;
    ctx.session.step = 'browsing';
    if (!ctx.session.menuShown) await replyKeyboard(ctx, '👌', mainMenu(L(ctx)));
    return showMenu(ctx, { asNewMessage: true });
  });

  pm.hears(allTexts('btnStepCancel'), async (ctx) => {
    if (!STEP_NUMBER[ctx.session.step]) return useMenu(ctx);
    resetFlow(ctx);
    return showHome(ctx);
  });

  pm.callbackQuery('cancelcart', async (ctx) => {
    resetFlow(ctx);
    await ctx.answerCallbackQuery();
    await appendLine(ctx, t(L(ctx), 'cartCancelled'));
    return useMenu(ctx);
  });

  pm.callbackQuery('confirm', async (ctx) => {
    const lang = L(ctx);
    const { cart, checkout, step } = ctx.session;
    if (step !== 'confirm' || !cart || !checkout?.phone) {
      // a second tap on the summary that already became an order: ignore it quietly
      const mid = ctx.callbackQuery.message?.message_id;
      if (mid !== undefined && mid === ctx.session.placedFrom) return ctx.answerCallbackQuery();
      return stale(ctx);
    }
    const merchant = await store.getMerchant(cart.merchantId);
    if (!merchant?.active) return stale(ctx);
    const menu = await activeMenu(cart.merchantId);
    const menuById = new Map(menu.map((i) => [i.id, i]));
    const summary = summarizeCart(cart, menuById, lang);
    if (summary.isEmpty) return stale(ctx);
    await ctx.answerCallbackQuery({ text: '⏳' });

    const customer = { id: ctx.from.id, name: customerName(ctx.from), lang };
    const order = await service.placeOrder({ customer, merchant, summary, checkout });
    ctx.session.placedFrom = ctx.callbackQuery.message?.message_id;
    resetFlow(ctx);
    // The order exists now: a failure saving the customer's details must not stop the shop
    // from being told about it.
    try {
      await store.saveCustomer({ id: String(ctx.from.id), name: customer.name, phone: checkout.phone, lang });
    } catch (err) {
      console.error(`save customer ${ctx.from.id} failed: ${err.message}`);
    }

    await appendLine(ctx, `📨 ${order.id}`);
    await replyKeyboard(ctx, t(lang, 'orderPlaced', { id: order.id, merchant: merchant.names[lang] }), mainMenu(lang));

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
      await appendLine(ctx, t(lang, 'orderCancelled', { id: order.id }));
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

  // ---------- payment guide ----------
  pm.callbackQuery(/^payhelp:(.+)$/, async (ctx) => {
    const lang = L(ctx);
    await ctx.answerCallbackQuery().catch(() => {});
    const text = t(lang, 'payGuideText');
    const file = config.paymentGuidePath;
    if (file && fs.existsSync(file)) {
      try {
        return await ctx.replyWithPhoto(new InputFile(file), { caption: text, ...HTML });
      } catch (err) {
        console.error('payment guide photo failed:', err.description || err.message);
      }
    }
    return ctx.reply(text, HTML);
  });

  pm.callbackQuery(/^callshop:(.+)$/, async (ctx) => {
    const lang = L(ctx);
    try {
      const order = await store.getOrder(ctx.match[1]);
      if (!order) throw new OrderError('NOT_FOUND');
      customerGuard(ctx.from.id)(order);
      const merchant = await store.getMerchant(order.merchantId);
      await ctx.answerCallbackQuery();
      return ctx.reply(th(lang, 'shopPhoneLine', { name: merchant?.names[lang] || order.merchantName, phone: merchant?.phone || config.supportPhone }), HTML);
    } catch (err) {
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
        return askPhone(ctx);
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
    await ctx.reply(t(lang, 'refReceived'), HTML);

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


