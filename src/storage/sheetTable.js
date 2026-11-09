// In-memory copy of one sheet tab (Orders, Customers, Reviews) with safe write-through.
// Reads come from memory. Writes go to the sheet first, then to memory.
// Every update re-reads the remembered row first: if the owner moved, inserted above or
// deleted rows by hand, the save never lands on another record's row. Only the patched
// fields are written onto that fresh row, so the owner's hand edits to other columns stay.
import { withRetry } from './retry.js';

const clone = (v) => (v == null ? v : structuredClone(v));

/**
 * io (the adapter the Google code implements):
 *   readAll(): Promise<Array<{ handle, data }>>
 *   append(data): Promise<handle>
 *   save(handle, patch): Promise<void>   write only the patch's fields onto that row
 *   readRowAt(handle): Promise<{ key, handle, data } | null>
 *     the row currently at that handle's position, freshly read (null past the end)
 */
export function createSheetTable({
  name,
  keyOf,
  io,
  now = Date.now,
  freshMs = 120000,
  log = console.warn,
  retryOptions = {},
}) {
  // key -> { handle, data, writtenAt }. writtenAt = when the bot last wrote this row.
  let rows = new Map();
  let refreshing = null; // the refresh in flight, shared by everyone who needs one
  const locks = new Map(); // key -> tail of that key's write queue

  const keyFor = (data) => String(keyOf(data) ?? '').trim();
  const retry = (fn, label, extra = {}) =>
    withRetry(fn, { label: `${name} ${label}`, ...retryOptions, ...extra });

  /** Writes to one key run one after another, so saves can't land out of order. */
  function serial(key, fn) {
    const prev = locks.get(key) || Promise.resolve();
    const run = prev.then(fn);
    const tail = run.catch(() => {});
    locks.set(key, tail);
    tail.then(() => {
      if (locks.get(key) === tail) locks.delete(key);
    });
    return run;
  }

  /**
   * Merge a fresh full read into memory: every row takes its fresh handle; data is the
   * sheet's unless the bot wrote that row within freshMs. Rows missing from the read are
   * dropped (deleted by hand) unless the bot wrote them within freshMs.
   * Returns the rows the read actually found: key -> { handle, data } as read.
   */
  function apply(fresh) {
    const t = now();
    const next = new Map();
    const seen = new Map();
    for (const { handle, data } of fresh) {
      const key = keyFor(data);
      if (!key || next.has(key)) continue;
      seen.set(key, { handle, data });
      const cur = rows.get(key);
      const keepMine = cur && t - cur.writtenAt < freshMs;
      next.set(key, { handle, data: keepMine ? cur.data : data, writtenAt: cur ? cur.writtenAt : -Infinity });
    }
    for (const [key, cur] of rows) {
      if (!next.has(key) && t - cur.writtenAt < freshMs) next.set(key, cur);
    }
    rows = next;
    return seen;
  }

  return {
    async load() {
      rows = new Map();
      apply(await retry(() => io.readAll(), 'read'));
    },

    all() {
      return [...rows.values()].map((r) => clone(r.data));
    },

    get(key) {
      return clone(rows.get(String(key ?? '').trim())?.data ?? null);
    },

    /** get, but on a miss read the sheet once and look again (a row another instance wrote). */
    async getOrRefresh(key) {
      const hit = this.get(key);
      if (hit) return hit;
      await this.refresh();
      return this.get(key);
    },

    add(data) {
      const key = keyFor(data);
      return serial(key, async () => {
        const handle = await retry(() => io.append(data), 'append', { idempotent: false });
        if (key) rows.set(key, { handle, data: clone(data), writtenAt: now() });
        return clone(data);
      });
    },

    update(key, patch) {
      key = String(key ?? '').trim();
      return serial(key, async () => {
        const cur = rows.get(key);
        if (!cur) return null;
        let row = await retry(() => io.readRowAt(cur.handle), 'read row');
        if (String(row?.key ?? '').trim() !== key) {
          // The row moved: a full re-read finds where it is now. Only a row this read found
          // has a trustworthy handle (not one kept in memory because it was fresh).
          row = apply(await retry(() => io.readAll(), 'read')).get(key);
          if (!row) {
            // Deleted by hand: forget it now (even if the bot wrote it recently), so later
            // calls see a plain miss instead of failing again and again.
            rows.delete(key);
            throw new Error(`row ${key} not found in ${name}`);
          }
        }
        await retry(() => io.save(row.handle, patch), 'save');
        const merged = { ...row.data, ...patch };
        rows.set(key, { handle: row.handle, data: merged, writtenAt: now() });
        return clone(merged);
      });
    },

    /** Callers that arrive while a refresh is running share it instead of reading again. */
    refresh() {
      if (!refreshing) {
        refreshing = (async () => {
          try {
            // Retries stay quiet here: a failed refresh logs exactly one line, below.
            apply(await retry(() => io.readAll(), 'read', { log: () => {} }));
          } catch (err) {
            const reason = err?.response?.status ?? err?.code ?? err?.message ?? String(err);
            log(`⚠️ ${name} refresh failed: ${reason}`);
          }
        })().finally(() => {
          refreshing = null;
        });
      }
      return refreshing;
    },
  };
}
