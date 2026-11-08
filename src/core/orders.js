// Pure business logic: no Telegram, no Google. Easy to test, easy to reuse in the real app later.

export const STATUS = Object.freeze({
  PLACED: 'PLACED', // sent to merchant, waiting for accept/reject
  ACCEPTED: 'ACCEPTED', // merchant accepted, waiting for customer to pay the merchant
  PAYMENT_SUBMITTED: 'PAYMENT_SUBMITTED', // customer sent a reference number, merchant must check
  CONFIRMED: 'CONFIRMED', // merchant confirmed money arrived -> preparing
  READY: 'READY', // food ready for pickup
  PICKED_UP: 'PICKED_UP', // rider has the order
  DELIVERED: 'DELIVERED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
});

const TRANSITIONS = {
  PLACED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['PAYMENT_SUBMITTED', 'CANCELLED'],
  // "payment not found" sends the order back to ACCEPTED so the customer can resend
  PAYMENT_SUBMITTED: ['CONFIRMED', 'ACCEPTED', 'CANCELLED'],
  CONFIRMED: ['READY', 'PICKED_UP', 'CANCELLED'],
  READY: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  REJECTED: [],
  CANCELLED: [],
};

/** Customers may cancel only before they have sent money. */
export const CUSTOMER_CANCELLABLE = new Set([STATUS.PLACED, STATUS.ACCEPTED]);
/** A rider can take an order once payment is confirmed. */
export const RIDER_TAKEABLE = new Set([STATUS.CONFIRMED, STATUS.READY]);
export const FINAL = new Set([STATUS.DELIVERED, STATUS.REJECTED, STATUS.CANCELLED]);

export class OrderError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code; // NOT_FOUND | BAD_TRANSITION | FORBIDDEN | TAKEN | INVALID
  }
}

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new OrderError('BAD_TRANSITION', `Cannot move order from ${from} to ${to}`);
  }
}

export function isFinal(status) {
  return FINAL.has(status);
}

// ---------- distance & money ----------

export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Estimated road distance in km (straight line x road factor), rounded to 0.1.
 * Returns null when either point is unknown.
 */
export function roadDistanceKm(from, to, roadFactor = 1.3) {
  if (!validPoint(from) || !validPoint(to)) return null;
  return Math.round(haversineKm(from, to) * roadFactor * 10) / 10;
}

function validPoint(p) {
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

/**
 * Delivery fee: base fee covers the first `baseKm`, then `perKmFee` per started km.
 * Orders beyond `maxKm` are out of range (bicycles!).
 */
export function calcDeliveryFee(distanceKm, { deliveryFeeBase, baseKm, perKmFee, maxKm }) {
  if (distanceKm == null || !Number.isFinite(distanceKm)) {
    return { fee: deliveryFeeBase, outOfRange: false };
  }
  const extraKm = Math.max(0, distanceKm - baseKm);
  return {
    fee: deliveryFeeBase + Math.ceil(extraKm - 1e-9) * perKmFee,
    outOfRange: distanceKm > maxKm,
  };
}

export function calcCommission(foodTotal, pct) {
  if (!Number.isFinite(foodTotal) || !Number.isFinite(pct)) return 0;
  return Math.round((foodTotal * pct) / 100);
}

export function calcRiderPay(deliveryFee, riderSharePct) {
  return Math.round((deliveryFee * riderSharePct) / 100);
}

/** What the business keeps from one delivered order. */
export function platformEarnings(order) {
  const n = (v) => (Number.isFinite(v) ? v : 0);
  return n(order.commission) + n(order.serviceFee) + n(order.deliveryFee) - n(order.riderPay);
}

/**
 * cart = { merchantId, items: { [itemId]: qty }, custom: string|null }
 * menuById = Map(itemId -> { id, merchantId, names, price })
 */
export function summarizeCart(cart, menuById, lang = 'en') {
  const lines = [];
  let total = 0;
  for (const [itemId, qty] of Object.entries(cart?.items || {})) {
    const item = menuById.get(itemId);
    if (!item || qty <= 0) continue;
    const subtotal = item.price * qty;
    total += subtotal;
    lines.push({
      itemId,
      name: item.names[lang] || item.names.en,
      nameEn: item.names.en,
      qty,
      price: item.price,
      subtotal,
    });
  }
  const custom = cart?.custom ? String(cart.custom) : null;
  return { lines, total, custom, isEmpty: lines.length === 0 && !custom };
}

export function formatMoney(n) {
  return `${Math.round(n).toLocaleString('en-US')} Br`;
}

// ---------- validation ----------

/** Ethiopian mobile numbers (Ethio telecom 09..., Safaricom 07...) normalized to 0XXXXXXXXX. */
export function normalizePhone(text) {
  if (typeof text !== 'string') return null;
  const digits = text.replace(/\D/g, '');
  let local = null;
  if (digits.length === 12 && digits.startsWith('251')) local = '0' + digits.slice(3);
  else if (digits.length === 10 && digits.startsWith('0')) local = digits;
  else if (digits.length === 9) local = '0' + digits;
  if (!local || !/^0[79]\d{8}$/.test(local)) return null;
  return local;
}

/** Transaction reference (Telebirr, CBE...): letters+digits only, 6-25 chars. */
export function normalizeRef(text) {
  if (typeof text !== 'string') return null;
  const ref = text.toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-Z0-9]{6,25}$/.test(ref)) return null;
  if (!/\d/.test(ref)) return null; // real references always contain digits
  return ref;
}

/** Strip control characters and limit length of free text typed by users. */
export function cleanText(text, maxLen) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

/**
 * Location typed or pasted as text: "7.2001, 38.5995", a Google Maps link with @lat,lng or q=lat,lng.
 * (Telegram Desktop can't share a GPS location, so desktop users paste one.)
 */
export function parseLatLng(text) {
  if (typeof text !== 'string') return null;
  const m = text.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) return null;
  return { lat, lng };
}

export function parseAmount(text) {
  if (typeof text !== 'string') return null;
  const n = Number(text.replace(/[,\s]/g, '').replace(/(br|birr|ብር)$/i, ''));
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return null;
  return Math.round(n);
}

// ---------- ids & time ----------

const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I confusion over the phone
const EAT_OFFSET_MS = 3 * 3600 * 1000; // Ethiopia is UTC+3, no daylight saving

export function newOrderId(now = new Date(), rand = Math.random) {
  const d = new Date(now.getTime() + EAT_OFFSET_MS);
  const yymmdd =
    String(d.getUTCFullYear()).slice(2) +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0');
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += ID_CHARS[Math.floor(rand() * ID_CHARS.length)];
  return `${yymmdd}-${suffix}`;
}

/** "2026-11-05 14:32:10" in Ethiopian time: readable in Google Sheets and sortable. */
export function localTimestamp(now = new Date()) {
  return new Date(now.getTime() + EAT_OFFSET_MS).toISOString().replace('T', ' ').slice(0, 19);
}

export function localDate(now = new Date()) {
  return localTimestamp(now).slice(0, 10);
}
