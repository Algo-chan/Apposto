// Google Sheets store. Your team watches orders live in the spreadsheet.
// Merchants / Menu / Riders are cached (CACHE_SECONDS) because you edit them by hand.
// Orders / Customers / Reviews are kept in memory (see sheetTable.js): reads cost no Sheets
// call, writes go to the sheet row and memory together, and a refresh every 60 s picks up
// hand edits. Every Google call has a timeout and retries transient failures.
import fs from 'node:fs';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { TABS, fromRow, toRow, withNames } from './schema.js';
import { withRetry } from './retry.js';
import { createSheetTable } from './sheetTable.js';

const REFRESH_MS = 60000;

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

/**
 * retryConfig limit 0: ky's own retries are off. withRetry is the only retry layer, so a
 * logical call makes at most 3 requests and nothing keeps retrying after our timeout.
 */
export function newSpreadsheet(sheetId, auth) {
  return new GoogleSpreadsheet(sheetId, auth, { retryConfig: { limit: 0 } });
}

export async function openSpreadsheet(config) {
  const doc = newSpreadsheet(config.sheetId, googleAuth(config));
  await withRetry(() => doc.loadInfo(), { label: 'Spreadsheet loadInfo' });
  return doc;
}

/** Header of the column that holds a tab's key field, e.g. Orders id -> order_id. */
function keyHeader(name, field) {
  return TABS[name].find(([, f]) => f === field)[0];
}

/**
 * What a fresh read of the sheet would give back after writing obj: written through toRow,
 * read through fromRow (numbers, empty cells, the formula guard). Fields obj lacks come back
 * empty, like blank cells.
 */
function asRead(name, obj) {
  const raw = toRow(name, obj);
  return fromRow(name, (h) => raw[h]);
}

/** asRead for a patch: only the fields the patch sets. */
function patchAsRead(name, patch) {
  const full = asRead(name, patch);
  const out = {};
  for (const [, field] of TABS[name]) if (field in patch) out[field] = full[field];
  return out;
}

/** deps.doc: an already opened spreadsheet (tests pass a fake one). */
export async function createSheetsStore(config, { doc: openDoc } = {}) {
  const doc = openDoc ?? (await openSpreadsheet(config));
  const ttl = config.cacheSeconds * 1000;
  const cache = new Map();

  function tab(name) {
    const sheet = doc.sheetsByTitle[name];
    if (!sheet) throw new Error(`Missing tab "${name}" in the spreadsheet. Run: npm run setup-sheet`);
    return sheet;
  }

  async function readRows(name) {
    const rows = await tab(name).getRows();
    return rows.map((row) => ({ handle: row, data: fromRow(name, (h) => row.get(h)) }));
  }

  /** Adapter between sheetTable and one google-spreadsheet tab. handle = GoogleSpreadsheetRow. */
  function sheetIo(name, keyField) {
    const header = keyHeader(name, keyField);
    return {
      readAll: () => readRows(name),
      append: (data) => tab(name).addRow(toRow(name, data), { raw: true }),
      // row is the fresh row from readRowAt/readAll; row.save writes the whole row, so it
      // must be fresh: only the patch's columns change.
      save: async (row, patch) => {
        row.assign(toRow(name, patch));
        await row.save({ raw: true });
      },
      readRowAt: async (row) => {
        const [current] = await tab(name).getRows({ offset: row.rowNumber - 2, limit: 1 });
        if (!current) return null;
        return {
          key: String(current.get(header) ?? '').trim(),
          handle: current,
          data: fromRow(name, (h) => current.get(h)),
        };
      },
    };
  }

  const table = (name, keyField) =>
    createSheetTable({ name, keyOf: (d) => d[keyField], io: sheetIo(name, keyField) });
  const orders = table('Orders', 'id');
  const customers = table('Customers', 'id');
  const reviews = table('Reviews', 'orderId');
  await Promise.all([orders.load(), customers.load(), reviews.load()]);

  let refreshing = false;
  async function refreshAll() {
    if (refreshing) return;
    refreshing = true;
    try {
      await Promise.all([orders.refresh(), customers.refresh(), reviews.refresh()]);
    } finally {
      refreshing = false;
    }
  }
  const timer = setInterval(refreshAll, REFRESH_MS);
  timer.unref();

  async function cached(name, map = (x) => x) {
    const hit = cache.get(name);
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    const rows = await withRetry(() => readRows(name), { label: `${name} read` });
    const value = rows.map(({ data }) => map(data)).filter((r) => r.id || r.telegramId);
    cache.set(name, { at: Date.now(), value });
    return value;
  }

  const merchants = () => cached('Merchants', withNames);
  const menu = () => cached('Menu', withNames);
  const riders = () => cached('Riders');

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
      return customers.get(String(tgId));
    },
    async saveCustomer(c) {
      const id = String(c.id);
      if (customers.get(id)) {
        try {
          if (await customers.update(id, patchAsRead('Customers', { ...c, id }))) return;
        } catch (err) {
          if (customers.get(id)) throw err; // still known: a real failure
          // the row was deleted by hand (update forgot it): write the customer again
        }
      }
      await customers.add(asRead('Customers', { ...c, id }));
    },
    async createOrder(order) {
      await orders.add(asRead('Orders', order));
      return order;
    },
    async getOrder(id, { refresh = true } = {}) {
      // On a miss read once more: after a deploy the old instance may still have written it.
      // refresh: false = memory only (for checks that expect a miss, like a brand-new order id).
      return refresh ? orders.getOrRefresh(id) : orders.get(id);
    },
    async updateOrder(id, patch) {
      const merged = await orders.update(id, patchAsRead('Orders', patch));
      return merged && { ...merged, ...patch };
    },
    async findOrderByPaymentRef(ref) {
      return orders.all().find((o) => o.paymentRef === ref) || null;
    },
    async listOrders({ customerId, statuses, datePrefix } = {}) {
      return orders
        .all()
        .filter(
          (o) =>
            o.id &&
            (!customerId || o.customerId === String(customerId)) &&
            (!statuses || statuses.includes(o.status)) &&
            (!datePrefix || o.createdAt.startsWith(datePrefix))
        );
    },
    async createReview(review) {
      await reviews.add(asRead('Reviews', review));
      return review;
    },
    async getReview(orderId) {
      return reviews.get(orderId);
    },
    async updateReview(orderId, patch) {
      const merged = await reviews.update(orderId, patchAsRead('Reviews', patch));
      return merged && { ...merged, ...patch };
    },
    async listReviews({ merchantId } = {}) {
      return reviews
        .all()
        .filter((r) => r.orderId && (!merchantId || r.merchantId === String(merchantId)));
    },
    clearCache() {
      cache.clear();
    },
    close() {
      clearInterval(timer);
    },
  };
}

export { TABS };
