// The mini app's JSON API. `user` is the Telegram user from verified initData (httpHandler does
// the check), so a customer can only see and change their own orders. Prices, fees and totals
// are always worked out here from the sheet; the page's numbers are only for display.
import { LANGS } from '../i18n.js';
import {
  STATUS,
  FINAL,
  OrderError,
  roadDistanceKm,
  calcDeliveryFee,
  normalizePhone,
  normalizeRef,
  cleanText,
  localTimestamp,
} from '../core/orders.js';
import { estimateRide } from '../core/eta.js';

const MAX_QTY = 20;
const IDEMPOTENCY_MS = 10 * 60 * 1000;
const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;
const NO_PAY = new Set([STATUS.PLACED, STATUS.REJECTED, STATUS.CANCELLED]);

class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
const fail = (status, code) => {
  throw new ApiError(status, code);
};

/** OrderError from the order service -> HTTP. Someone else's order looks like no order at all. */
const ORDER_ERRORS = {
  NOT_FOUND: [404, 'NOT_FOUND'],
  FORBIDDEN: [404, 'NOT_FOUND'],
  BAD_TRANSITION: [409, 'BAD_TRANSITION'],
  DUPLICATE_REF: [409, 'DUPLICATE_REF'],
  INVALID: [400, 'BAD_REQUEST'],
};

const imgUrl = (fileId) => (fileId ? `/img/${fileId}` : null);
const isPoint = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng);

export function createWebApi({ store, config, insights, checkout, now = () => Date.now() }) {
  const recent = new Map(); // `${userId}:${requestId}` -> { at, job }

  async function activeShop(id) {
    const m = await store.getMerchant(String(id ?? ''));
    if (!m || !m.active) fail(409, 'SHOP_CLOSED');
    return m;
  }
  async function activeMenu(merchantId) {
    return (await store.getMenu(merchantId)).filter((i) => i.active && Number.isFinite(i.price));
  }
  async function ownOrder(user, id) {
    const order = await store.getOrder(String(id));
    if (!order || order.customerId !== user.id) fail(404, 'NOT_FOUND');
    return order;
  }
  function customerName(user) {
    return cleanText(`${user.firstName} ${user.lastName}`.trim(), 60) || 'Customer';
  }
  function quoteFor(merchant, lat, lng) {
    const distanceKm = isPoint(lat, lng)
      ? roadDistanceKm({ lat: merchant.lat, lng: merchant.lng }, { lat, lng }, config.roadFactor)
      : null;
    const { fee, outOfRange } = calcDeliveryFee(distanceKm, config);
    return { distanceKm, deliveryFee: fee, outOfRange };
  }

  // ---------- routes ----------

  async function me(user) {
    const c = await store.getCustomer(user.id);
    const open = (await store.listOrders({ customerId: user.id }))
      .filter((o) => !FINAL.has(o.status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { lang: c?.lang || null, phone: c?.phone || '', openOrderId: open[0]?.id ?? null };
  }

  async function setLang(user, body) {
    if (!LANGS.includes(body?.lang)) fail(400, 'BAD_REQUEST');
    const known = await store.getCustomer(user.id);
    await store.saveCustomer({
      id: user.id,
      name: known?.name || customerName(user),
      lang: body.lang,
      ...(known ? {} : { createdAt: localTimestamp() }),
    });
    return { ok: true };
  }

  async function shops() {
    const open = (await store.getMerchants()).filter((m) => m.active);
    const out = [];
    for (const m of open) {
      out.push({ id: m.id, names: m.names, prepMin: await insights.prepMinutes(m), banner: imgUrl(m.banner) });
    }
    return { shops: out };
  }

  async function menu(merchantId) {
    const m = await activeShop(merchantId);
    const items = (await activeMenu(m.id)).map((i) => ({ id: i.id, names: i.names, price: i.price, photo: imgUrl(i.photo) }));
    return { shop: { id: m.id, names: m.names, banner: imgUrl(m.banner) }, items };
  }

  async function quote(body) {
    const m = await activeShop(body?.merchantId);
    const q = quoteFor(m, body.lat, body.lng);
    return { ...q, serviceFee: config.serviceFee, eta: await insights.eta(m, q.distanceKm) };
  }

  /** Checks the request and builds the order from the sheet; throws ApiError on bad input. */
  async function buildOrder(user, body) {
    if (!body || typeof body.items !== 'object' || body.items === null || Array.isArray(body.items)) fail(400, 'BAD_REQUEST');
    const merchant = await activeShop(body.merchantId);
    const menuById = new Map((await activeMenu(merchant.id)).map((i) => [i.id, i]));
    const items = {};
    for (const [id, raw] of Object.entries(body.items)) {
      if (!Number.isFinite(raw)) fail(400, 'BAD_REQUEST');
      if (raw <= 0) continue;
      if (!menuById.has(id)) fail(409, 'ITEM_GONE');
      items[id] = Math.min(MAX_QTY, Math.max(1, Math.floor(raw)));
    }
    const custom = cleanText(body.custom ?? '', 300) || null;
    if (Object.keys(items).length === 0 && !custom) fail(400, 'EMPTY');
    const phone = normalizePhone(String(body.phone ?? ''));
    if (!phone) fail(400, 'BAD_PHONE');
    const landmark = cleanText(body.landmark ?? '', 200);
    if (landmark.length < 3) fail(400, 'BAD_LANDMARK');
    const lat = isPoint(body.lat, body.lng) ? body.lat : null;
    const lng = lat == null ? null : body.lng;
    const q = quoteFor(merchant, lat, lng);
    if (q.outOfRange) fail(409, 'OUT_OF_RANGE');

    const lang = (await store.getCustomer(user.id))?.lang || 'en';
    return {
      customer: { id: user.id, name: customerName(user), lang },
      merchant,
      cart: { merchantId: merchant.id, items, custom },
      checkout: { lat, lng, distanceKm: q.distanceKm, deliveryFee: q.deliveryFee, landmark, phone },
    };
  }

  /** One order per (customer, requestId) for 10 minutes, also when both requests arrive at once. */
  async function placeOrder(user, body) {
    if (!REQUEST_ID.test(String(body?.requestId ?? ''))) fail(400, 'BAD_REQUEST');
    const t = now();
    for (const [k, v] of recent) if (t - v.at > IDEMPOTENCY_MS) recent.delete(k);
    const key = `${user.id}:${body.requestId}`;
    const hit = recent.get(key);
    if (hit) return hit.job;
    const job = (async () => {
      const order = await checkout.placeAndNotify(await buildOrder(user, body));
      return { orderId: order.id };
    })();
    recent.set(key, { at: t, job });
    job.catch(() => recent.delete(key)); // a refused order may be sent again after fixing it
    return job;
  }

  async function etaFor(order) {
    if (order.status === STATUS.PICKED_UP) return estimateRide(order.distanceKm, config);
    if (FINAL.has(order.status)) return null;
    const m = await store.getMerchant(order.merchantId);
    return m ? insights.eta(m, order.distanceKm) : null;
  }

  async function orderStatus(user, id) {
    const order = await ownOrder(user, id);
    const lang = order.customerLang || 'en';
    const merchant = await store.getMerchant(order.merchantId);
    const names = new Map((merchant ? await store.getMenu(merchant.id) : []).map((i) => [i.id, i.names]));
    let saved = [];
    try {
      saved = JSON.parse(order.itemsJson || '[]');
    } catch {
      /* hand-edited row: no lines */
    }
    const lines = saved.map(({ itemId, qty, price }) => ({
      name: names.get(itemId)?.[lang] || names.get(itemId)?.en || itemId,
      qty,
      subtotal: qty * price,
    }));
    const pay =
      NO_PAY.has(order.status) || !merchant
        ? null
        : {
            amount: order.foodTotal,
            telebirr: merchant.telebirr || '',
            cbeAccount: merchant.cbeAccount || '',
            accountName: merchant.accountName || '',
            phone: merchant.phone || '',
          };
    return {
      id: order.id,
      status: order.status,
      shopName: merchant?.names[lang] || order.merchantName,
      lines,
      custom: order.customRequest || null,
      foodTotal: order.foodTotal,
      deliveryFee: order.deliveryFee,
      serviceFee: order.serviceFee,
      eta: await etaFor(order),
      pay,
      rider: order.riderId ? { name: order.riderName, phone: order.riderPhone } : null,
    };
  }

  async function submitRef(user, id, body) {
    await ownOrder(user, id);
    const ref = normalizeRef(String(body?.ref ?? ''));
    if (!ref) fail(400, 'BAD_REF');
    const order = await checkout.submitRefAndNotify({ orderId: String(id), customerId: user.id, ref });
    return { status: order.status };
  }

  const ROUTES = [
    ['GET', /^\/api\/me$/, (u) => me(u)],
    ['POST', /^\/api\/lang$/, (u, b) => setLang(u, b)],
    ['GET', /^\/api\/shops$/, () => shops()],
    ['GET', /^\/api\/shops\/([^/]+)\/menu$/, (u, b, [id]) => menu(id)],
    ['POST', /^\/api\/quote$/, (u, b) => quote(b)],
    ['POST', /^\/api\/orders$/, (u, b) => placeOrder(u, b)],
    ['GET', /^\/api\/orders\/([^/]+)$/, (u, b, [id]) => orderStatus(u, id)],
    ['POST', /^\/api\/orders\/([^/]+)\/ref$/, (u, b, [id]) => submitRef(u, id, b)],
  ];

  /** -> { status, body }. Never throws. */
  async function handle(method, path, { user, body } = {}) {
    for (const [m, re, fn] of ROUTES) {
      const match = re.exec(path);
      if (!match || m !== method) continue;
      let params;
      try {
        params = match.slice(1).map(decodeURIComponent);
      } catch {
        break; // a badly encoded id: no such thing
      }
      try {
        return { status: 200, body: await fn(user, body, params) };
      } catch (err) {
        if (err instanceof ApiError) return { status: err.status, body: { error: err.code } };
        if (err instanceof OrderError && ORDER_ERRORS[err.code]) {
          const [status, error] = ORDER_ERRORS[err.code];
          return { status, body: { error } };
        }
        console.error(`api ${method} ${path} failed:`, err);
        return { status: 500, body: { error: 'ERROR' } };
      }
    }
    return { status: 404, body: { error: 'NOT_FOUND' } };
  }

  return { handle };
}
