// Creates the tabs + header rows in your Google Sheet. Safe to run more than once.
// Usage: npm run setup-sheet            (tabs only)
//        npm run setup-sheet -- --demo  (also adds a demo merchant + menu)
import dotenv from 'dotenv';
import { loadConfig } from '../src/config.js';
import { openSpreadsheet } from '../src/storage/sheetsStore.js';
import { TABS, headers, toRow } from '../src/storage/schema.js';
import { DEMO_SEED } from '../src/storage/memoryStore.js';

dotenv.config({ quiet: true });

const { config, problems } = loadConfig({ ...process.env, STORAGE: 'sheets', BOT_TOKEN: process.env.BOT_TOKEN || 'x' });
const sheetProblems = problems.filter((p) => !p.startsWith('BOT_TOKEN'));
if (sheetProblems.length) {
  console.error('Fix your .env first:\n- ' + sheetProblems.join('\n- '));
  process.exit(1);
}

const doc = await openSpreadsheet(config);
console.log(`Connected to "${doc.title}"`);

for (const name of Object.keys(TABS)) {
  const wanted = headers(name);
  let sheet = doc.sheetsByTitle[name];
  if (!sheet) {
    // A new tab has only 26 columns by default, and Orders needs more
    sheet = await doc.addSheet({
      title: name,
      headerValues: wanted,
      gridProperties: { rowCount: 1000, columnCount: Math.max(26, wanted.length), frozenRowCount: 1 },
    });
    console.log(`+ created tab ${name}`);
    continue;
  }
  let current = [];
  try {
    await sheet.loadHeaderRow();
    current = sheet.headerValues;
  } catch {
    /* empty sheet */
  }
  const missing = wanted.filter((h) => !current.includes(h));
  if (missing.length) {
    const columns = [...current, ...missing];
    // Grow only: new columns go on the right, existing rows are not touched
    if (columns.length > sheet.columnCount) await sheet.resize({ rowCount: sheet.rowCount, columnCount: columns.length });
    await sheet.setHeaderRow(columns);
    console.log(`~ ${name}: added columns ${missing.join(', ')}`);
  } else {
    console.log(`✓ ${name} ok`);
  }
}

if (process.argv.includes('--demo')) {
  await doc.sheetsByTitle.Merchants.addRows(DEMO_SEED.merchants.map((m) => toRow('Merchants', m)), { raw: true });
  await doc.sheetsByTitle.Menu.addRows(DEMO_SEED.menu.map((i) => toRow('Menu', i)), { raw: true });
  console.log('+ demo merchant and menu added (put your Telegram id in Merchants.telegram_id to test)');
}

const defaultSheet = doc.sheetsByTitle['Sheet1'];
if (defaultSheet && Object.keys(doc.sheetsByTitle).length > 1) {
  console.log('Tip: you can delete the empty "Sheet1" tab.');
}
console.log('Done ✅');
