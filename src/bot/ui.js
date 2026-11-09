// Keyboards and message rendering.
import { InlineKeyboard, Keyboard } from 'grammy';
import { t, LANGS, LANG_LABELS } from '../i18n.js';
import { summarizeCart, formatMoney } from '../core/orders.js';
import { esc } from './html.js';

/** Bottom menu. Persistent: it stays visible even after the customer types a message. */
export function mainMenu(lang) {
  return new Keyboard()
    .text(t(lang, 'btnOrder'))
    .row()
    .text(t(lang, 'btnMyOrders'))
    .text(t(lang, 'btnHelp'))
    .row()
    .text(t(lang, 'btnLang'))
    .resized()
    .persistent();
}

export function langKeyboard() {
  const kb = new InlineKeyboard();
  for (const l of LANGS) kb.text(LANG_LABELS[l], `lang:${l}`).row();
  return kb;
}

/** Inline version of the main menu: always visible inside the message, also on Telegram Desktop. */
export function homeInline(lang) {
  return new InlineKeyboard()
    .text(t(lang, 'btnStartOrder'), 'menu:order')
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

/** Progress line on each checkout step, e.g. '▰▰▱▱  Step 2 of 4'. */
export function progressLine(lang, step) {
  return `${'▰'.repeat(step)}${'▱'.repeat(4 - step)}  ${t(lang, 'stepOf', { n: step })}`;
}

/** The menu's Next button: item count (sum of quantities) and food total, or "your request". */
export function cartNextLabel(summary, lang) {
  if (summary.lines.length === 0 && summary.custom) return t(lang, 'cartNextRequest');
  const count = summary.lines.reduce((n, l) => n + l.qty, 0);
  return t(lang, 'cartNext', { count, total: formatMoney(summary.total) });
}

/**
 * Step 1 (HTML). rating: {avg, count} | null, eta: {min, max} | null; a missing one is left out.
 * Every shop / item name and the written request are escaped.
 */
export function renderMenu({ merchant, menu, cart, lang, eta, rating = null }) {
  const menuById = new Map(menu.map((i) => [i.id, i]));
  const s = summarizeCart(cart, menuById, lang);
  const lines = [progressLine(lang, 1), `<b>🏪 ${esc(merchant.names[lang] || merchant.names.en)}</b>`];
  const info = [];
  if (rating) info.push(`⭐ ${rating.avg.toFixed(1)} (${rating.count})`);
  if (eta) info.push(t(lang, 'etaLine', eta));
  if (info.length) lines.push(info.join(' · '));
  lines.push(t(lang, 'menuHint'), '', esc(t(lang, 'yourOrder')));
  if (s.isEmpty) lines.push(esc(t(lang, 'empty')));
  for (const l of s.lines) lines.push(esc(`${l.qty} × ${l.name} = ${formatMoney(l.subtotal)}`));
  if (s.custom) lines.push(`✍️ "${esc(s.custom)}"`);
  if (!s.isEmpty) lines.push('', esc(`${t(lang, 'food')}: ${foodText(s, lang)}`));

  const kb = new InlineKeyboard();
  for (const item of menu) {
    const qty = cart.items[item.id] || 0;
    kb.text(`➕ ${item.names[lang]} · ${formatMoney(item.price)}`, `add:${item.id}`);
    if (qty > 0) kb.text(`➖ ${qty}`, `rem:${item.id}`);
    kb.row();
  }
  kb.text(t(lang, 'btnCustom'), 'custom').row();
  kb.text(cartNextLabel(s, lang), 'checkout').row();
  kb.text(t(lang, 'btnShops'), 'back').text(t(lang, 'btnClear'), 'clear');
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

/** Order summary (HTML): who gets paid what. Food goes to the shop; delivery + service is cash to the rider. */
export function renderSummary({ merchant, summary, checkout, serviceFee, lang, eta }) {
  const cash = (checkout.deliveryFee || 0) + (serviceFee || 0);
  return [
    `<b>${esc(t(lang, 'summaryTitle'))}</b>`,
    `🏪 ${esc(t(lang, 'shop'))}: <b>${esc(merchant.names[lang] || merchant.names.en)}</b>`,
    '',
    esc(itemLines(summary, lang)),
    '',
    `🍲 ${esc(t(lang, 'food'))} <b>${esc(foodText(summary, lang))}</b> · ${esc(t(lang, 'payShopTag'))}`,
    `🚲 ${esc(t(lang, 'deliveryFee'))} ${formatMoney(checkout.deliveryFee)}${distanceText(checkout.distanceKm)}` +
      ` · 🧾 ${esc(t(lang, 'serviceFee'))} ${formatMoney(serviceFee)}`,
    `💵 <b>${formatMoney(cash)}</b> · ${esc(t(lang, 'cashRiderTag'))}`,
    '',
    `📍 ${esc(checkout.landmark)}`,
    `📞 <code>${esc(checkout.phone)}</code>`,
    ...(eta ? [t(lang, 'etaLine', eta)] : []),
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
