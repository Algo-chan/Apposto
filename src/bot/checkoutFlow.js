// Placing an order and receiving a payment reference: the same messages to the shop, the dispatch
// group and the customer's live tracker, whether the order came from the chat or the mini app.
// Chat-only replies (the bottom menu, "📨 id" under the summary) stay in customer.js.
import { InlineKeyboard } from 'grammy';
import { t } from '../i18n.js';
import { summarizeCart, formatMoney } from '../core/orders.js';
import { itemLines, foodText, distanceText } from './ui.js';
import { th } from './html.js';

export function createCheckoutFlow({ store, service, notify, tracker }) {
  async function activeMenuById(merchantId) {
    const menu = (await store.getMenu(merchantId)).filter((i) => i.active && Number.isFinite(i.price));
    return new Map(menu.map((i) => [i.id, i]));
  }

  /**
   * customer: { id, name, lang }; cart: { merchantId, items: { itemId: qty }, custom };
   * checkout: { lat, lng, distanceKm, deliveryFee, landmark, phone }.
   * headlineMarkup: the keyboard sent with the "order placed" headline in the customer's chat.
   * onPlaced(order): the caller's own reply, run once the order is saved and before the shop
   * is told (the chat stamps "📨 id" under the summary there).
   */
  async function placeAndNotify({ customer, merchant, cart, checkout, headlineMarkup, onPlaced }) {
    const lang = customer.lang;
    const menuById = await activeMenuById(merchant.id);
    const summary = summarizeCart(cart, menuById, lang);
    const order = await service.placeOrder({ customer, merchant, summary, checkout });
    // The order exists now: a failure saving the customer's details must not stop the shop
    // from being told about it.
    try {
      await store.saveCustomer({ id: String(customer.id), name: customer.name, phone: checkout.phone, lang });
    } catch (err) {
      console.error(`save customer ${customer.id} failed: ${err.message}`);
    }
    if (onPlaced) await onPlaced(order);

    // The shop (in the shop's language) with Accept / Reject
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

    // The dispatch group
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

    // Headline + the first live card in the customer's chat. Not awaited and sent last: a slow
    // first render must not hold up the shop or the dispatch group.
    const placed = th(lang, 'orderPlaced', { id: order.id, merchant: merchant.names[lang] });
    const other = headlineMarkup ? { reply_markup: headlineMarkup } : {};
    void tracker.update(order, { headline: { text: placed, other } });
    return order;
  }

  /**
   * Throws OrderError (DUPLICATE_REF, FORBIDDEN, BAD_TRANSITION, NOT_FOUND) like submitPayment.
   * onSubmitted(order): the caller's own reply, before the shop is told.
   */
  async function submitRefAndNotify({ orderId, customerId, ref, onSubmitted }) {
    const order = await service.submitPayment(orderId, customerId, ref);
    if (onSubmitted) await onSubmitted(order);
    const merchant = await store.getMerchant(order.merchantId);
    if (merchant) {
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
    }
    await notify.dispatch(`💳 ${order.id}: customer sent ref ${ref} for ${formatMoney(order.foodTotal)}`);
    return order;
  }

  return { placeAndNotify, submitRefAndNotify };
}
