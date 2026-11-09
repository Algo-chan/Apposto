// Tests for the in-memory sheet table: reads from memory, safe write-through, background refresh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSheetTable } from '../src/storage/sheetTable.js';

const quiet = { sleep: async () => {}, log: () => {} };

/** Fake sheet tab backed by an array of rows. handle = { index }. */
function fakeIo(initial) {
  const rows = initial.map((r) => ({ ...r }));
  const calls = { readAll: 0, append: 0, save: [], readRowAt: 0 };
  let failReadAll = null;
  return {
    rows,
    calls,
    failReadAll(err) {
      failReadAll = err;
    },
    io: {
      async readAll() {
        calls.readAll++;
        if (failReadAll) throw failReadAll;
        return rows.map((data, index) => ({ handle: { index }, data: { ...data } }));
      },
      async append(data) {
        calls.append++;
        rows.push({ ...data });
        return { index: rows.length - 1 };
      },
      async save(handle, patch) {
        calls.save.push({ handle, patch: { ...patch } });
        rows[handle.index] = { ...rows[handle.index], ...patch };
      },
      async readRowAt(handle) {
        calls.readRowAt++;
        const row = rows[handle.index];
        return row ? { key: row.id ?? '', handle: { index: handle.index }, data: { ...row } } : null;
      },
    },
  };
}

/** retryLog: also send withRetry's own lines to `logs`, so a test sees every line the table makes. */
function setup(initial, { retryLog = false } = {}) {
  const fake = fakeIo(initial);
  const clock = { t: 1_000_000 };
  const logs = [];
  const push = (msg) => logs.push(msg);
  const table = createSheetTable({
    name: 'Orders',
    keyOf: (d) => d.id,
    io: fake.io,
    now: () => clock.t,
    log: push,
    retryOptions: retryLog ? { sleep: quiet.sleep, log: push } : quiet,
  });
  return { fake, clock, logs, table };
}

const ROWS = [
  { id: 'O1', status: 'placed' },
  { id: 'O2', status: 'accepted' },
];

test('reads come from memory', async () => {
  const { fake, table } = setup(ROWS);
  await table.load();
  for (let i = 0; i < 5; i++) {
    table.get('O1');
    table.all();
  }
  assert.equal(fake.calls.readAll, 1);
  assert.deepEqual(table.get('O1'), { id: 'O1', status: 'placed' });
  assert.equal(table.get('nope'), null);
  assert.equal(table.all().length, 2);
});

test('all skips rows with an empty key and returns clones', async () => {
  const { table } = setup([...ROWS, { id: '', status: 'junk' }]);
  await table.load();
  assert.deepEqual(table.all().map((r) => r.id), ['O1', 'O2']);
  table.get('O1').status = 'mutated';
  table.all()[0].status = 'mutated';
  assert.equal(table.get('O1').status, 'placed');
});

test('add then get without reading', async () => {
  const { fake, table } = setup([]);
  await table.load();
  const added = await table.add({ id: 'O1', status: 'placed' });
  assert.deepEqual(added, { id: 'O1', status: 'placed' });
  assert.deepEqual(table.get('O1'), { id: 'O1', status: 'placed' });
  assert.equal(fake.calls.append, 1);
  assert.equal(fake.calls.readAll, 1);
});

test('update writes to the sheet and memory', async () => {
  const { fake, table } = setup(ROWS);
  await table.load();
  const merged = await table.update('O1', { status: 'accepted' });
  assert.deepEqual(merged, { id: 'O1', status: 'accepted' });
  assert.equal(fake.calls.save.length, 1);
  assert.deepEqual(fake.calls.save[0].handle, { index: 0 });
  assert.deepEqual(fake.calls.save[0].patch, { status: 'accepted' });
  assert.deepEqual(fake.rows[0], { id: 'O1', status: 'accepted' });
  assert.equal(table.get('O1').status, 'accepted');
  assert.equal(fake.calls.readAll, 1);
});

test('hand edit to another column survives a bot update', async () => {
  const { fake, table } = setup([{ id: 'O1', status: 'placed', riderName: '' }, ROWS[1]]);
  await table.load();
  await table.update('O1', { status: 'accepted' }); // bot wrote this row moments ago
  fake.rows[0].status = 'cancelled'; // owner types into the sheet; no refresh yet
  const merged = await table.update('O1', { riderName: 'Abebe' }); // a rider takes it
  assert.deepEqual(fake.calls.save[1].patch, { riderName: 'Abebe' });
  assert.deepEqual(fake.rows[0], { id: 'O1', status: 'cancelled', riderName: 'Abebe' });
  assert.deepEqual(merged, { id: 'O1', status: 'cancelled', riderName: 'Abebe' });
  assert.equal(table.get('O1').status, 'cancelled');
});

test('update of an unknown key returns null and writes nothing', async () => {
  const { fake, table } = setup(ROWS);
  await table.load();
  assert.equal(await table.update('O9', { status: 'x' }), null);
  assert.equal(fake.calls.save.length, 0);
});

test('refresh picks up hand edits', async () => {
  const { fake, clock, table } = setup(ROWS);
  await table.load();
  fake.rows[0].status = 'cancelled';
  clock.t += 3 * 60 * 1000;
  await table.refresh();
  assert.equal(table.get('O1').status, 'cancelled');
});

test('refresh picks up hand edits to rows the bot wrote long ago', async () => {
  const { fake, clock, table } = setup(ROWS);
  await table.load();
  await table.update('O1', { status: 'paid' });
  fake.rows[0].status = 'cancelled';
  clock.t += 3 * 60 * 1000;
  await table.refresh();
  assert.equal(table.get('O1').status, 'cancelled');
});

test('refresh keeps fresh bot writes', async () => {
  const { fake, clock, table } = setup(ROWS);
  await table.load();
  await table.update('O1', { status: 'paid' });
  fake.rows[0].status = 'accepted'; // the sheet read lags behind the bot's write
  clock.t += 30 * 1000;
  await table.refresh();
  assert.equal(table.get('O1').status, 'paid');
});

test('refresh drops rows deleted by hand but keeps fresh bot adds', async () => {
  const { fake, clock, table } = setup(ROWS);
  await table.load();
  await table.add({ id: 'O3', status: 'placed' });
  fake.rows.splice(1, 2); // O2 deleted by hand; O3 not visible in this read yet
  clock.t += 30 * 1000;
  await table.refresh();
  assert.equal(table.get('O2'), null);
  assert.equal(table.get('O3').status, 'placed');
});

test('row moved by hand', async () => {
  const { fake, table } = setup(ROWS);
  await table.load();
  [fake.rows[0], fake.rows[1]] = [fake.rows[1], fake.rows[0]];
  fake.rows[1].landmark = 'gate'; // and a hand edit to the moved row
  await table.update('O1', { status: 'accepted' });
  assert.equal(fake.calls.readAll, 2);
  assert.equal(fake.calls.save.length, 1);
  assert.deepEqual(fake.calls.save[0].handle, { index: 1 });
  assert.deepEqual(fake.calls.save[0].patch, { status: 'accepted' });
  assert.deepEqual(fake.rows[0], { id: 'O2', status: 'accepted' });
  assert.deepEqual(fake.rows[1], { id: 'O1', status: 'accepted', landmark: 'gate' });
  assert.deepEqual(table.get('O1'), { id: 'O1', status: 'accepted', landmark: 'gate' });
});

test('update throws when the row was deleted by hand', async () => {
  const { fake, table } = setup(ROWS);
  await table.load();
  fake.rows.splice(0, 1);
  await assert.rejects(table.update('O1', { status: 'x' }), /row O1 not found in Orders/);
  assert.equal(fake.calls.save.length, 0);
  assert.deepEqual(fake.rows, [{ id: 'O2', status: 'accepted' }]);
});

test('update throws when a freshly written row was deleted by hand', async () => {
  const { fake, table } = setup(ROWS);
  await table.load();
  await table.update('O1', { status: 'paid' });
  fake.rows.splice(0, 1);
  await assert.rejects(table.update('O1', { status: 'x' }), /row O1 not found in Orders/);
  assert.equal(fake.calls.save.length, 1);
  assert.deepEqual(fake.rows, [{ id: 'O2', status: 'accepted' }]);
  // forgotten at once: the next update is a plain miss, not another throw
  assert.equal(table.get('O1'), null);
  assert.equal(await table.update('O1', { status: 'y' }), null);
  assert.equal(fake.calls.save.length, 1);
});

test('getOrRefresh finds a row another instance wrote after load', async () => {
  const { fake, table } = setup(ROWS);
  await table.load();
  fake.rows.push({ id: 'O3', status: 'placed' }); // e.g. the old instance during a deploy
  assert.equal(table.get('O3'), null);
  assert.deepEqual(await table.getOrRefresh('O3'), { id: 'O3', status: 'placed' });
  assert.equal(fake.calls.readAll, 2);
  assert.deepEqual(await table.getOrRefresh('O1'), { id: 'O1', status: 'placed' }); // hit: no read
  assert.equal(await table.getOrRefresh('nope'), null);
  assert.equal(fake.calls.readAll, 3);
});

test('concurrent updates to one key are saved in order', async () => {
  const { fake, table } = setup(ROWS);
  await table.load();
  await Promise.all([
    table.update('O1', { status: 'accepted' }),
    table.update('O1', { paymentRef: 'R1' }),
  ]);
  assert.deepEqual(fake.rows[0], { id: 'O1', status: 'accepted', paymentRef: 'R1' });
  assert.deepEqual(table.get('O1'), { id: 'O1', status: 'accepted', paymentRef: 'R1' });
});

test('refresh failure keeps data and logs one line', async () => {
  const { fake, logs, table } = setup(ROWS, { retryLog: true });
  await table.load();
  fake.failReadAll({ response: { status: 429 } });
  await table.refresh();
  assert.deepEqual(table.get('O1'), { id: 'O1', status: 'placed' });
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^⚠️ Orders refresh failed: 429/);
  assert.equal(fake.calls.readAll, 4); // load + 3 tries
});

test('load failure throws', async () => {
  const { fake, table } = setup(ROWS);
  fake.failReadAll({ response: { status: 503 } });
  await assert.rejects(table.load(), (err) => err.response.status === 503);
  assert.equal(fake.calls.readAll, 3);
});

test('add is not retried on a server error', async () => {
  const { fake, table } = setup([]);
  await table.load();
  fake.io.append = async () => {
    fake.calls.append++;
    throw { response: { status: 503 } };
  };
  await assert.rejects(table.add({ id: 'O1' }));
  assert.equal(fake.calls.append, 1);
  assert.equal(table.get('O1'), null);
});

test('misses at the same moment share one sheet read', async () => {
  const { fake, table } = setup(ROWS);
  await table.load();
  const before = fake.calls.readAll;
  await Promise.all([table.getOrRefresh('x1'), table.getOrRefresh('x2'), table.refresh()]);
  assert.equal(fake.calls.readAll - before, 1);
  await table.getOrRefresh('x3'); // a later miss reads again
  assert.equal(fake.calls.readAll - before, 2);
});
