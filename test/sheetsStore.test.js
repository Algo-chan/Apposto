// The Google Sheets store over a fake spreadsheet (no network): hand deletions, deploy overlap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSheetsStore } from '../src/storage/sheetsStore.js';
import { createMemoryStore } from '../src/storage/memoryStore.js';
import { TABS, headers } from '../src/storage/schema.js';

/**
 * Fake google-spreadsheet tab: rows are plain { header: value } objects, row 1 is the header.
 * Like the real library, a value for a header the sheet does not have is silently dropped.
 */
function fakeSheet(headerValues) {
  const rows = [];
  const known = (obj) => Object.fromEntries(Object.entries(obj).filter(([h]) => headerValues.includes(h)));
  const wrap = (index) => {
    const data = rows[index];
    const pending = {};
    return {
      rowNumber: index + 2,
      get: (h) => (h in pending ? pending[h] : data[h]),
      assign: (obj) => Object.assign(pending, known(obj)),
      save: async () => {
        Object.assign(rows[index], pending);
      },
    };
  };
  return {
    rows,
    headerValues,
    async getRows({ offset = 0, limit = Infinity } = {}) {
      const out = [];
      for (let i = offset; i < rows.length && out.length < limit; i++) out.push(wrap(i));
      return out;
    },
    async addRow(obj) {
      rows.push(known(obj));
      return wrap(rows.length - 1);
    },
  };
}

/** without: { Tab: ['header', ...] } columns that tab's header row lacks (an old sheet). */
async function setup({ without = {}, log } = {}) {
  const sheets = Object.fromEntries(
    Object.keys(TABS).map((name) => [name, fakeSheet(headers(name).filter((h) => !(without[name] || []).includes(h)))])
  );
  const store = await createSheetsStore({ cacheSeconds: 60 }, { doc: { sheetsByTitle: sheets }, log });
  return { sheets, store };
}

test('saveCustomer writes the customer again when its row was deleted by hand', async () => {
  const { sheets, store } = await setup();
  try {
    await store.saveCustomer({ id: '100', name: 'C', lang: 'en' });
    sheets.Customers.rows.splice(0, 1); // deleted by hand right after the bot wrote it
    await store.saveCustomer({ id: '100', name: 'C', phone: '0911234567', lang: 'en' });
    assert.equal(sheets.Customers.rows.length, 1);
    assert.equal(sheets.Customers.rows[0].telegram_id, '100');
    assert.equal(sheets.Customers.rows[0].phone, '0911234567');
    assert.equal((await store.getCustomer(100)).phone, '0911234567');
  } finally {
    store.close();
  }
});

test('getOrder finds an order another instance wrote after load', async () => {
  const { sheets, store } = await setup();
  try {
    sheets.Orders.rows.push({ order_id: '261109-AB12', status: 'PLACED', customer_id: '100' }); // old instance, mid-deploy
    const o = await store.getOrder('261109-AB12');
    assert.equal(o?.status, 'PLACED');
    assert.equal(await store.getOrder('261109-ZZZZ'), null);
  } finally {
    store.close();
  }
});

test('getOrder with refresh off never reads the sheet on a miss', async () => {
  const { sheets, store } = await setup();
  try {
    let reads = 0;
    const getRows = sheets.Orders.getRows;
    sheets.Orders.getRows = (...a) => { reads++; return getRows(...a); };
    assert.equal(await store.getOrder('261109-NEW1', { refresh: false }), null);
    assert.equal(reads, 0);
  } finally {
    store.close();
  }
});

test('a sheet without a newer column is reported once at startup, with the fix', async () => {
  const lines = [];
  const { store } = await setup({ without: { Orders: ['tracker_msg_id'] }, log: (l) => lines.push(l) });
  try {
    assert.deepEqual(store.missingColumns(), { Orders: ['tracker_msg_id'] });
    assert.deepEqual(lines, ['⚠️ Orders is missing columns: tracker_msg_id — run: npm run setup-sheet']);
  } finally {
    store.close();
  }
});

test('every missing column of a tab goes on its one line', async () => {
  const lines = [];
  const { store } = await setup({ without: { Orders: ['tracker_msg_id', 'eta_max'], Riders: ['lang'] }, log: (l) => lines.push(l) });
  try {
    assert.deepEqual(store.missingColumns(), { Orders: ['eta_max', 'tracker_msg_id'], Riders: ['lang'] });
    assert.equal(lines.length, 2);
    assert.ok(lines.includes('⚠️ Orders is missing columns: eta_max, tracker_msg_id — run: npm run setup-sheet'));
    assert.ok(lines.includes('⚠️ Riders is missing columns: lang — run: npm run setup-sheet'));
  } finally {
    store.close();
  }
});

test('an up-to-date sheet logs nothing and reports no missing columns', async () => {
  const lines = [];
  const { store } = await setup({ log: (l) => lines.push(l) });
  try {
    assert.deepEqual(store.missingColumns(), {});
    assert.deepEqual(lines, []);
  } finally {
    store.close();
  }
  assert.deepEqual(createMemoryStore().missingColumns(), {});
});

test('setMenuPhoto writes the photo cell and the next read sees it', async () => {
  const { sheets, store } = await setup();
  try {
    sheets.Menu.rows.push({ item_id: 'I1', merchant_id: 'M1', name_en: 'Burger', price: 250, active: 'TRUE' });
    await store.getMenu('M1'); // fills the cache
    const item = await store.setMenuPhoto('i1', 'FILE1');
    assert.equal(item.id, 'I1');
    assert.equal(item.names.en, 'Burger');
    assert.equal(sheets.Menu.rows[0].photo, 'FILE1');
    assert.equal((await store.getMenu('M1'))[0].photo, 'FILE1');
    assert.equal(await store.setMenuPhoto('I9', 'X'), null);
  } finally {
    store.close();
  }
});

test('setMerchantBanner writes the banner cell and the next read sees it', async () => {
  const { sheets, store } = await setup();
  try {
    sheets.Merchants.rows.push({ merchant_id: 'M1', name_en: 'Burger House', active: 'TRUE' });
    await store.getMerchant('M1');
    const m = await store.setMerchantBanner('m1', 'BAN1');
    assert.equal(m.id, 'M1');
    assert.equal(m.names.en, 'Burger House');
    assert.equal(sheets.Merchants.rows[0].banner, 'BAN1');
    assert.equal((await store.getMerchant('M1')).banner, 'BAN1');
    assert.equal(await store.setMerchantBanner('M9', 'X'), null);
  } finally {
    store.close();
  }
});
