// In-memory store: same interface as the Google Sheets store.
// Used for demo mode (STORAGE=memory) and automated tests. Data is lost on restart.
import { withNames } from './schema.js';

const clone = (v) => (v == null ? v : structuredClone(v));

export function createMemoryStore(seed = {}) {
  const db = {
    merchants: (seed.merchants || []).map(withNames),
    menu: (seed.menu || []).map(withNames),
    riders: seed.riders || [],
    customers: new Map(),
    orders: new Map(),
    reviews: new Map(),
  };

  return {
    kind: 'memory',
    async getMerchants() {
      return clone(db.merchants);
    },
    async getMerchant(id) {
      return clone(db.merchants.find((m) => m.id === String(id)) || null);
    },
    async getMerchantByTelegramId(tgId) {
      return clone(db.merchants.find((m) => m.telegramId && m.telegramId === String(tgId)) || null);
    },
    async getMenu(merchantId) {
      return clone(db.menu.filter((i) => i.merchantId === String(merchantId)));
    },
    async getRider(tgId) {
      return clone(db.riders.find((r) => r.telegramId === String(tgId)) || null);
    },
    async getCustomer(tgId) {
      return clone(db.customers.get(String(tgId)) || null);
    },
    async saveCustomer(c) {
      const prev = db.customers.get(String(c.id)) || {};
      db.customers.set(String(c.id), { ...prev, ...c, id: String(c.id) });
    },
    async createOrder(order) {
      db.orders.set(order.id, clone(order));
      return clone(order);
    },
    async getOrder(id) {
      return clone(db.orders.get(id) || null);
    },
    async updateOrder(id, patch) {
      const cur = db.orders.get(id);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      db.orders.set(id, next);
      return clone(next);
    },
    async findOrderByPaymentRef(ref) {
      for (const o of db.orders.values()) if (o.paymentRef === ref) return clone(o);
      return null;
    },
    async listOrders({ customerId, statuses, datePrefix } = {}) {
      return clone(
        [...db.orders.values()].filter(
          (o) =>
            (!customerId || o.customerId === String(customerId)) &&
            (!statuses || statuses.includes(o.status)) &&
            (!datePrefix || o.createdAt.startsWith(datePrefix))
        )
      );
    },
    async createReview(review) {
      db.reviews.set(review.orderId, clone(review));
      return clone(review);
    },
    async getReview(orderId) {
      return clone(db.reviews.get(orderId) || null);
    },
    async updateReview(orderId, patch) {
      const cur = db.reviews.get(orderId);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      db.reviews.set(orderId, next);
      return clone(next);
    },
    async listReviews({ merchantId } = {}) {
      return clone([...db.reviews.values()].filter((r) => !merchantId || r.merchantId === String(merchantId)));
    },
    clearCache() {},
    close() {},
    // test helpers
    _db: db,
  };
}

/** Demo data so you can try the bot before setting up Google Sheets. */
export const DEMO_SEED = {
  merchants: [
    {
      id: 'M1',
      nameEn: 'Demo Burger House',
      nameOm: 'Mana Baargarii Fakkeenyaa',
      nameAm: 'ማሳያ በርገር ቤት',
      telegramId: '', // put YOUR Telegram id here (or in the sheet) to receive merchant messages
      phone: '0911000000',
      lang: 'en',
      telebirr: '0911000000',
      cbeAccount: '1000123456789',
      accountName: 'Demo Burger House',
      commissionPct: 8,
      lat: null, // no location in demo, so it works wherever you test from (base fee)
      lng: null,
      active: true,
    },
  ],
  menu: [
    { id: 'I1', merchantId: 'M1', nameEn: 'Burger', nameOm: 'Baargarii', nameAm: 'በርገር', price: 250, active: true },
    { id: 'I2', merchantId: 'M1', nameEn: 'Chips', nameOm: 'Chiipsii', nameAm: 'ችፕስ', price: 120, active: true },
    { id: 'I3', merchantId: 'M1', nameEn: 'Mango juice', nameOm: 'Juusii maangoo', nameAm: 'የማንጎ ጭማቂ', price: 90, active: true },
  ],
  riders: [],
};
