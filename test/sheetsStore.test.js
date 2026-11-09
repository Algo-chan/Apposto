// The Google Sheets store over a fake spreadsheet (no network): hand deletions, deploy overlap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSheetsStore } from '../src/storage/sheetsStore.js';

/** Fake google-spreadsheet tab: rows are plain { header: value } objects, row 1 is the header. */
function fakeSheet() {
  const rows = [];
  const wrap = (index) => {
    const data = rows[index];
    const pending = {};
    return {
      rowNumber: index + 2,
      get: (h) => (h in pending ? pending[h] : data[h]),
      assign: (obj) => Object.assign(pending, obj),
      save: async () => {
        Object.assign(rows[index], pending);
      },
    };
  };
  return {
    rows,
    async getRows({ offset = 0, limit = Infinity } = {}) {
      const out = [];
      for (let i = offset; i < rows.length && out.length < limit; i++) out.push(wrap(i));
      return out;
    },
    async addRow(obj) {
      rows.push({ ...obj });
      return wrap(rows.length - 1);
    },
  };
}

async function setup() {
  const sheets = { Orders: fakeSheet(), Customers: fakeSheet(), Reviews: fakeSheet(), Merchants: fakeSheet(), Menu: fakeSheet(), Riders: fakeSheet() };
  const store = await createSheetsStore({ cacheSeconds: 60 }, { doc: { sheetsByTitle: sheets } });
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
