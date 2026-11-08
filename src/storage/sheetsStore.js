// Google Sheets store. Your team watches orders live in the spreadsheet.
// Merchants / Menu / Riders are cached (CACHE_SECONDS) because you edit them by hand.
// Orders are always read fresh, so status changes are never based on stale data.
import fs from 'node:fs';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { TABS, fromRow, toRow, withNames } from './schema.js';

export function googleAuth(config) {
  let email = config.googleClientEmail;
  let key = config.googlePrivateKey;
  if (config.googleCredentialsFile) {
    const json = JSON.parse(fs.readFileSync(config.googleCredentialsFile, 'utf8'));
    email = json.client_email;
    key = json.private_key;
  }
  return new JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
}

export async function openSpreadsheet(config) {
  const doc = new GoogleSpreadsheet(config.sheetId, googleAuth(config));
  await doc.loadInfo();
  return doc;
}

export async function createSheetsStore(config) {
  const doc = await openSpreadsheet(config);
  const ttl = config.cacheSeconds * 1000;
  const cache = new Map();

  function tab(name) {
    const sheet = doc.sheetsByTitle[name];
    if (!sheet) throw new Error(`Missing tab "${name}" in the spreadsheet. Run: npm run setup-sheet`);
    return sheet;
  }

  async function readAll(name) {
    const rows = await tab(name).getRows();
    return rows.map((row) => ({ row, data: fromRow(name, (h) => row.get(h)) }));
  }

  async function cached(name, map = (x) => x) {
    const hit = cache.get(name);
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    const value = (await readAll(name)).map(({ data }) => map(data)).filter((r) => r.id || r.telegramId);
    cache.set(name, { at: Date.now(), value });
    return value;
  }

  const merchants = () => cached('Merchants', withNames);
  const menu = () => cached('Menu', withNames);
  const riders = () => cached('Riders');

  async function findOrderRow(id) {
    const all = await readAll('Orders');
    return all.find((r) => r.data.id === id) || null;
  }

  return {
    kind: 'sheets',
    async getMerchants() {
      return merchants();
    },
    async getMerchant(id) {
      return (await merchants()).find((m) => m.id === String(id)) || null;
    },
    async getMerchantByTelegramId(tgId) {
      return (await merchants()).find((m) => m.telegramId && m.telegramId === String(tgId)) || null;
    },
    async getMenu(merchantId) {
      return (await menu()).filter((i) => i.merchantId === String(merchantId));
    },
    async getRider(tgId) {
      return (await riders()).find((r) => r.telegramId === String(tgId)) || null;
    },
    async getCustomer(tgId) {
      const hit = cache.get(`customer:${tgId}`);
      if (hit) return hit.value;
      const found = (await readAll('Customers')).find((r) => r.data.id === String(tgId));
      const value = found ? found.data : null;
      if (value) cache.set(`customer:${tgId}`, { at: Date.now(), value });
      return value;
    },
    async saveCustomer(c) {
      const all = await readAll('Customers');
      const found = all.find((r) => r.data.id === String(c.id));
      const values = toRow('Customers', { ...c, id: String(c.id) });
      if (found) {
        found.row.assign(values);
        await found.row.save({ raw: true });
      } else {
        await tab('Customers').addRow(values, { raw: true });
      }
      cache.set(`customer:${c.id}`, { at: Date.now(), value: { ...(found?.data || {}), ...c, id: String(c.id) } });
    },
    async createOrder(order) {
      await tab('Orders').addRow(toRow('Orders', order), { raw: true });
      return order;
    },
    async getOrder(id) {
      return (await findOrderRow(id))?.data || null;
    },
    async updateOrder(id, patch) {
      const found = await findOrderRow(id);
      if (!found) return null;
      found.row.assign(toRow('Orders', patch));
      await found.row.save({ raw: true });
      return { ...found.data, ...patch };
    },
    async findOrderByPaymentRef(ref) {
      return (await readAll('Orders')).find((r) => r.data.paymentRef === ref)?.data || null;
    },
    async listOrders({ customerId, statuses, datePrefix } = {}) {
      return (await readAll('Orders'))
        .map((r) => r.data)
        .filter(
          (o) =>
            o.id &&
            (!customerId || o.customerId === String(customerId)) &&
            (!statuses || statuses.includes(o.status)) &&
            (!datePrefix || o.createdAt.startsWith(datePrefix))
        );
    },
    async createReview(review) {
      await tab('Reviews').addRow(toRow('Reviews', review), { raw: true });
      cache.delete('reviews');
      return review;
    },
    async getReview(orderId) {
      return (await readAll('Reviews')).find((r) => r.data.orderId === orderId)?.data || null;
    },
    async updateReview(orderId, patch) {
      const found = (await readAll('Reviews')).find((r) => r.data.orderId === orderId);
      if (!found) return null;
      found.row.assign(toRow('Reviews', patch));
      await found.row.save({ raw: true });
      cache.delete('reviews');
      return { ...found.data, ...patch };
    },
    async listReviews({ merchantId } = {}) {
      let hit = cache.get('reviews');
      if (!hit || Date.now() - hit.at >= ttl) {
        hit = { at: Date.now(), value: (await readAll('Reviews')).map((r) => r.data).filter((r) => r.orderId) };
        cache.set('reviews', hit);
      }
      return hit.value.filter((r) => !merchantId || r.merchantId === String(merchantId));
    },
    clearCache() {
      cache.clear();
    },
  };
}

export { TABS };
