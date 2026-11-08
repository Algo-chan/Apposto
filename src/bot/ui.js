// Keyboards and message rendering.
import { InlineKeyboard, Keyboard } from 'grammy';
import { t, LANGS, LANG_LABELS } from '../i18n.js';
import { summarizeCart, formatMoney } from '../core/orders.js';

export function mainMenu(lang) {
  return new Keyboard()
    .text(t(lang, 'btnOrder'))
    .row()
    .text(t(lang, 'btnMyOrders'))
    .text(t(lang, 'btnHelp'))
    .row()
    .text(t(lang, 'btnLang'))
    .resized();
}

export function langKeyboard() {
  const kb = new InlineKeyboard();
  for (const l of LANGS) kb.text(LANG_LABELS[l], `lang:${l}`).row();
  return kb;
}

/** Inline version of the main menu: always visible inside the message, also on Telegram Desktop. */
export function homeInline(lang) {
  return new InlineKeyboard()
    .text(t(lang, 'btnOrder'), 'menu:order')
    .row()
    .text(t(lang, 'btnMyOrders'), 'menu:orders')
    .text(t(lang, 'btnHelp'), 'menu:help')
    .row()
    .text(t(lang, 'btnLang'), 'menu:lang');
}

/** ratings: Map(merchantId -> {avg, count} | null). Rating shows only once a shop has enough reviews. */
export function merchantsKeyboard(merchants, lang, ratings = new Map()) {
  const kb = new InlineKeyboard();
  for (const m of merchants) {
    const r = ratings.get(m.id);
    const stars = r ? ` · ⭐ ${r.avg.toFixed(1)} (${r.count})` : '';
    kb.text(`🏪 ${m.names[lang] || m.names.en}${stars}`, `m:${m.id}`).row();
  }
  return kb;
}

export function renderMenu({ merchant, menu, cart, lang, eta }) {
  const menuById = new Map(menu.map((i) => [i.id, i]));
  const s = summarizeCart(cart, menuById, lang);
  const lines = [`🏪 ${merchant.names[lang]}`];
  if (eta) lines.push(t(lang, 'etaLine', eta));
  lines.push(t(lang, 'menuHint'), '', t(lang, 'yourOrder'));
  if (s.isEmpty) lines.push(t(lang, 'empty'));
  for (const l of s.lines) lines.push(`${l.qty} × ${l.name} = ${formatMoney(l.subtotal)}`);
  if (s.custom) lines.push(`✍️ "${s.custom}"`);
  if (!s.isEmpty) lines.push('', `${t(lang, 'food')}: ${foodText(s, lang)}`);

  const kb = new InlineKeyboard();
  for (const item of menu) {
    const qty = cart.items[item.id] || 0;
    kb.text(`➕ ${item.names[lang]} · ${formatMoney(item.price)}`, `add:${item.id}`);
    if (qty > 0) kb.text(`➖ ${qty}`, `rem:${item.id}`);
    kb.row();
  }
  kb.text(t(lang, 'btnCustom'), 'custom').row();
  kb.text(t(lang, 'btnClear'), 'clear').text(t(lang, 'btnCheckout'), 'checkout').row();
  kb.text(t(lang, 'btnBack'), 'back');
  return { text: lines.join('\n'), keyboard: kb, summary: s };
}

/** forShop: wording for the merchant ("you set the price") instead of the customer. */
export function foodText(summary, lang, forShop = false) {
  if (summary.lines.length === 0) return t(lang, forShop ? 'mPriceYou' : 'priceByShop');
  return formatMoney(summary.total) + (summary.custom ? ` ${t(lang, forShop ? 'mPlusCustom' : 'plusCustom')}` : '');
}

export function itemLines(summary, lang) {
  const lines = summary.lines.map((l) => `${l.qty} × ${l.name} = ${formatMoney(l.subtotal)}`);
  if (summary.custom) lines.push(`✍️ ${t(lang, 'mCustom')}: "${summary.custom}"`);
  return lines.join('\n');
}

export function distanceText(km) {
  return Number.isFinite(km) ? ` (~${km} km)` : '';
}

export function renderSummary({ merchant, summary, checkout, serviceFee, lang, eta }) {
  return [
    t(lang, 'summaryTitle'),
    `${t(lang, 'shop')}: ${merchant.names[lang]}`,
    '',
    itemLines(summary, lang),
    '',
    `${t(lang, 'food')}: ${foodText(summary, lang)}`,
    `${t(lang, 'deliveryFee')}: ${formatMoney(checkout.deliveryFee)}${distanceText(checkout.distanceKm)}`,
    `${t(lang, 'serviceFee')}: ${formatMoney(serviceFee)}`,
    ...(eta ? ['', t(lang, 'etaLine', eta)] : []),
    '',
    `📍 ${t(lang, 'location')}: ${checkout.landmark}`,
    `📞 ${t(lang, 'phone')}: ${checkout.phone}`,
    '',
    t(lang, 'howToPay'),
  ].join('\n');
}

export function merchantAccounts(merchant, lang) {
  const lines = [];
  if (merchant.telebirr) lines.push(`📱 Telebirr: ${merchant.telebirr}`);
  if (merchant.cbeAccount) lines.push(`🏦 CBE: ${merchant.cbeAccount}`);
  if (merchant.accountName) lines.push(`👤 ${t(lang, 'accountName')}: ${merchant.accountName}`);
  if (lines.length === 0) lines.push(`📞 ${merchant.phone}`);
  return lines.join('\n');
}

export function customerFees(order) {
  return formatMoney((order.deliveryFee || 0) + (order.serviceFee || 0));
}
