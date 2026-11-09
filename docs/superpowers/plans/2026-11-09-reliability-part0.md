# Reliability (Part 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The bot stays responsive when many people use it at once and recovers by itself from slow Google Sheets, Telegram limits, crashes and Render's sleep.

**Architecture:** Updates are processed in parallel per chat (`@grammyjs/runner` + `sequentialize`). The Sheets store keeps Orders, Customers and Reviews in memory (write-through, background refresh) and wraps every Google call in timeout + retry. Small middlewares make button spinners always stop and log slow updates. `index.js` supervises the runner, reports real health, and pings itself awake on Render.

**Tech Stack:** Node ≥ 20 (ES modules), grammY 1.46, `@grammyjs/runner` 2.0.3, `@grammyjs/auto-retry` 2.0.2, google-spreadsheet 5 (ky HTTP errors expose `err.response.status`), `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-09-customer-ux-redesign-design.md`, section "Part 0: Stay fast and never get stuck". Parts 1–4 of that spec get their own plan after this one ships. Fix 8 (cheap images) belongs to them, because there are no images yet.

## Global Constraints

- Single Render instance only. The per-order lock (`src/core/lock.js`) and the in-memory tables assume one process.
- Sheets call timeout **10 s**. At most **3** tries, with growing randomised waits.
- Background refresh of in-memory tabs every **60 s**. Rows the bot wrote in the last **2 minutes** keep the bot's version.
- Slow-update log threshold **3 s**.
- Keep-alive ping every **10 minutes** to `${RENDER_EXTERNAL_URL}/health`, only when `RENDER_EXTERNAL_URL` is set.
- `/health` returns **503** when the runner is not running, else 200 with the current JSON.
- Merchant, rider and dispatch message wording does not change in this plan.
- `npm test` (all existing 31 tests plus the new ones) passes after every task.

## Review Focus

1. **The owner sorts or deletes rows in the Orders sheet while the bot runs.** Cached row positions go stale, and a save must not overwrite a different order's row. Expected: before saving, the bot checks the row still holds the same ID. If not, it reloads and saves to the right row. (Test in Task 2.)
2. **An append times out but actually reached Google.** Expected: no duplicate order row, because appends are retried only when Google certainly didn't apply them (429 or connection refused / DNS failure), never on timeout or 5xx. (Test in Task 1.)
3. **Google is down while the bot starts.** Expected: startup retries, then exits with an error so Render restarts it. It doesn't run half-loaded. (Test in Task 2.)
4. **The background refresh fails (429, network).** Expected: the bot keeps serving the last good data, logs one line, and doesn't crash. (Test in Task 2.)
5. **A customer double-taps "Place order" fast.** Expected: exactly one order. (Test in Task 3.)

---

### Task 1: Timeout and retry helper

**Files:**
- Create: `src/storage/retry.js`
- Test: `test/retry.test.js`

**Interfaces:**
- Produces:
  - `withTimeout(promise, ms, label): Promise`. Rejects with an `Error` whose `name === 'TimeoutError'` and message contains `label` and `ms`.
  - `isRetryable(err, { idempotent }): boolean`.
  - `withRetry(fn, { label, idempotent = true, tries = 3, timeoutMs = 10000, baseDelayMs = 500, sleep, log = console.warn }): Promise`. Calls `fn()` wrapped in `withTimeout`. On a retryable error it waits `baseDelayMs * 2 ** attempt * (0.5 + Math.random())` via `sleep(ms)` (default real `setTimeout` promise), logs `↻ <label> retry <n>/<tries-1>: <reason>`, and tries again. It rethrows the last error.

- [ ] **Step 1: Write the failing tests** in `test/retry.test.js` (use `sleep: async () => {}` and `log: () => {}`):
  - `withTimeout rejects slow promise`: `withTimeout(new Promise(() => {}), 20, 'x')` rejects with `name === 'TimeoutError'`.
  - `retries 429 then succeeds`: fn throws `{ response: { status: 429 } }` twice, then returns `'ok'`. Result `'ok'`, fn called 3 times.
  - `gives up after 3 tries`: fn always throws `{ response: { status: 503 } }`. Rejects with that error, fn called 3 times.
  - `does not retry 400`: fn throws `{ response: { status: 400 } }`. Called once.
  - `retries ECONNRESET and TimeoutError when idempotent`: both retryable with `{ idempotent: true }`.
  - `non-idempotent retries only certain failures`: with `{ idempotent: false }`, `isRetryable` is true for status 429, `code: 'ECONNREFUSED'` and `code: 'ENOTFOUND'`, and false for status 503, `code: 'ECONNRESET'` and `name: 'TimeoutError'`.

- [ ] **Step 2: Run** `node --test test/retry.test.js`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/storage/retry.js`.** Status is `err.response?.status ?? err.status`. Retryable when idempotent: status 429 or ≥ 500, `TimeoutError`, or code in `ECONNRESET, ETIMEDOUT, ECONNREFUSED, ENOTFOUND, EAI_AGAIN, UND_ERR_SOCKET`, or `err.name === 'TypeError' && /fetch failed/.test(err.message)`. When not idempotent: only 429, `ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`.

- [ ] **Step 4: Run** `node --test test/retry.test.js`. Expected: all pass.

- [ ] **Step 5: Commit**
```bash
git add src/storage/retry.js test/retry.test.js
git commit -m "feat(storage): timeout and retry helper for Google Sheets calls"
```

---

### Task 2: In-memory tables for Orders, Customers and Reviews

**Files:**
- Create: `src/storage/sheetTable.js`
- Modify: `src/storage/sheetsStore.js` (whole file: route Orders/Customers/Reviews through tables; wrap all Google calls in `withRetry`; add `close()`)
- Modify: `src/storage/memoryStore.js` (add a no-op `close()`)
- Test: `test/sheetTable.test.js`

**Interfaces:**
- Consumes: `withRetry` from Task 1.
- Produces: `createSheetTable({ name, keyOf, io, now = Date.now, freshMs = 120000, log = console.warn })` returning:
  - `load(): Promise<void>`, the first full read. It throws if every retry fails.
  - `all(): object[]`, clones of the data of rows whose key is non-empty.
  - `get(key): object | null`, a clone.
  - `add(data): Promise<object>`. Appends through `io.append` (non-idempotent retry) and stores it in memory.
  - `update(key, patch): Promise<object | null>`. Merges, then saves through `io.save` with a row check (below). Returns the merged data, or `null` for an unknown key.
  - `refresh(): Promise<void>`. Never throws. On failure it logs `⚠️ <name> refresh failed: <reason>` and keeps the old data.
  - `io` (the adapter Google code implements, fakeable in tests):
    - `readAll(): Promise<Array<{ handle, data }>>`
    - `append(data): Promise<handle>`
    - `save(handle, data): Promise<void>`
    - `readKeyAt(handle): Promise<string>` reads the key cell currently at that handle's row.
- Store API is unchanged (same methods as today) plus `close(): void`, which stops the refresh timer.

- [ ] **Step 1: Write the failing tests** in `test/sheetTable.test.js` against a fake `io` backed by an array of rows (handle = `{ index }`). Count calls per method, and use a fake clock via `now`:
  - `reads come from memory`: after `load()`, 5 calls to `get`/`all` cause 0 more `readAll` calls.
  - `add then get without reading`: `add({ id: 'O1' })`, then `get('O1')` returns it, and `readAll` is still called only once.
  - `update writes to the sheet and memory`: `update('O1', { status: 'accepted' })` calls `io.save` once with merged data, and `get('O1').status === 'accepted'`.
  - `refresh picks up hand edits`: change the fake row's `status` to `'cancelled'`, advance the clock 3 minutes, `refresh()`, then `get` shows `'cancelled'`.
  - `refresh keeps fresh bot writes`: `update` sets `status: 'paid'`, the fake row still says `'accepted'`, advance the clock 30 s, `refresh()`, then `get` still shows `'paid'`.
  - `row moved by hand`: after `load()`, swap two fake rows. `update('O1', …)` sees `readKeyAt` return a different ID, calls `readAll` again, and saves to the row that now holds `O1`. The other row is unchanged.
  - `refresh failure keeps data`: `readAll` throws `{ response: { status: 429 } }` on every call (use `sleep` no-op through an injectable `retryOptions`). `refresh()` resolves, `get` still returns the old data, and `log` was called once.
  - `load failure throws`: `readAll` always throws 503, so `load()` rejects.

- [ ] **Step 2: Run** `node --test test/sheetTable.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement `createSheetTable`** in `src/storage/sheetTable.js`. Memory is `Map(key → { handle, data, writtenAt })`. Pass `retryOptions` (default `{}`) through to every `withRetry` call so tests can disable waiting. `refresh` merge rule: take the fresh `handle` for every row; take fresh `data` unless `now() - writtenAt < freshMs`. `update` row check: `readKeyAt(handle) !== key` → `readAll()` replace, then save to the new handle; if the key is gone, throw `Error('row <key> not found in <name>')`.

- [ ] **Step 4: Run** `node --test test/sheetTable.test.js`. Expected: all pass.

- [ ] **Step 5: Wire it into `src/storage/sheetsStore.js`.**
  - Build one `io` per tab from google-spreadsheet:
    - `readAll` = `getRows()` mapped with `fromRow`.
    - `append` = `addRow(toRow(...), { raw: true })`.
    - `save` = `handle.assign(toRow(...)); handle.save({ raw: true })`.
    - `readKeyAt` = `sheet.getRows({ offset: handle.rowNumber - 2, limit: 1 })` → that row's key column (`order_id`/`id` header per `TABS`).
  - Tables and keys: `Orders` key `id`, `Customers` key `id`, `Reviews` key `orderId`.
  - Await `load()` of all three in `createSheetsStore`.
  - Start `setInterval(refreshAll, 60000).unref()`. `close()` clears it.
  - Rewrite the order, customer and review methods to use the tables, keeping their current return shapes and filters (`listOrders` filters by `customerId`, `statuses` and `datePrefix` over `orders.all()`).
  - `doc.loadInfo()` and the Merchants/Menu/Riders `getRows()` calls go through `withRetry` (idempotent).

- [ ] **Step 6: Add `close() {}` to `src/storage/memoryStore.js`.** Run `npm test`. Expected: all tests pass (the 31 existing ones plus the new ones).

- [ ] **Step 7: Check against the real sheet** (owner's `.env`, `STORAGE=sheets`): run `npm start`, send `/start` and one `📦 My orders` from a phone. Expected: the log shows `📗 Connected to Google Sheets` and no errors, and My orders lists the test orders from 2026-11-06/07.

- [ ] **Step 8: Commit**
```bash
git add src/storage/sheetTable.js src/storage/sheetsStore.js src/storage/memoryStore.js test/sheetTable.test.js
git commit -m "perf(storage): keep orders, customers and reviews in memory with safe write-through"
```

---

### Task 3: Parallel chats, Telegram retries, no spinning buttons, slow-update log

**Files:**
- Create: `src/bot/reliability.js`
- Modify: `src/bot/createBot.js` (install middlewares before `session`; install `autoRetry`)
- Modify: `src/bot/customer.js:85-87` (stale recovery) and `src/bot/customer.js:282` (answer `⏳`)
- Modify: `package.json` (add `@grammyjs/runner@^2.0.3`, `@grammyjs/auto-retry@^2.0.2`)
- Test: `test/reliability.test.js`; extend `test/flow.test.js`

**Interfaces:**
- Produces from `src/bot/reliability.js`:
  - `chatKey(ctx): string | undefined` = `String(ctx.chat?.id ?? ctx.from?.id)`, or `undefined` when neither exists.
  - `autoAnswerCallbacks(): Middleware`. Wraps `ctx.answerCallbackQuery` to record that it was called. After `next()` resolves, if the update is a callback query that was never answered, it answers with no text (errors swallowed). If `next()` throws, it rethrows without answering, so `bot.catch` shows the error alert.
  - `slowUpdateLog({ thresholdMs = 3000, log = console.warn, now = Date.now }): Middleware`. Logs `⏱ slow <updateType> <ms>ms chat=<id>` when `next()` takes ≥ threshold (also when it throws, then rethrows).
- `createBot` middleware order: `sequentialize(chatKey)` → `slowUpdateLog()` → `autoAnswerCallbacks()` → `session` → existing. `bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 30 }))`.

- [ ] **Step 1: Write the failing tests.**
  - In `test/reliability.test.js`, with plain fake `ctx` objects:
    - `answers an unanswered button`: a handler that does nothing → `answerCallbackQuery` called once.
    - `does not double-answer`: a handler that answers → called once in total.
    - `does not answer when handler throws`: the middleware rejects and `answerCallbackQuery` is not called.
    - `logs slow updates`: fake `now` advancing 3500 → `log` called once with a string containing `slow` and `3500`. At 100 ms there's no log.
  - In `test/flow.test.js`, using the existing `setup()` harness:
    - `double tap on Place order creates one order`: go through checkout to the summary, then `await Promise.all([tap(C, 'confirm'), tap(C, 'confirm')])`. Expect `(await store.listOrders({ customerId: C })).length === 1`.
    - `two customers are handled in parallel`: wrap the store's `getMerchant` with a 300 ms delay. `Promise.all` of `/start` + `🛍 Order` for customers 100 and 101 finishes in < 900 ms (it would take ≥ 1200 ms one at a time).
    - `old button after restart shows home`: a fresh customer (lang set, no cart) taps `checkout` → the last alert text equals `t('en','staleButton')`, and a message with the welcome text was sent to that customer.

- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement.**
  - Install the packages: `npm install @grammyjs/runner@^2.0.3 @grammyjs/auto-retry@^2.0.2`.
  - Write `src/bot/reliability.js` and wire `createBot.js` as in Interfaces.
  - In `customer.js`, `stale(ctx)` answers the alert, then calls `showHome(ctx)`.
  - In the `confirm` handler, `ctx.answerCallbackQuery({ text: '⏳' })`.

- [ ] **Step 4: Run** `npm test`. Expected: all pass.

- [ ] **Step 5: Commit**
```bash
git add package.json package-lock.json src/bot/reliability.js src/bot/createBot.js src/bot/customer.js test/reliability.test.js test/flow.test.js
git commit -m "feat(bot): handle chats in parallel, retry Telegram limits, never leave buttons spinning"
```

---

### Task 4: Runner supervision, real health check, keep-alive

**Files:**
- Create: `src/runtime.js`
- Modify: `src/index.js:40-90` (replace `bot.start` with the runner; use `createHealthHandler`; start keep-alive; graceful stop)
- Modify: `DEPLOY.md` §5 and Troubleshooting
- Test: `test/runtime.test.js`

**Interfaces:**
- Produces from `src/runtime.js`:
  - `createHealthHandler({ isRunning, startedAt = Date.now() }): (req, res) => void`. `/` and `/health` return 200 `{ ok: true, uptime, runner: 'running' }` when `isRunning()`, else 503 `{ ok: false, runner: 'stopped' }`. Anything else returns 404, as today.
  - `superviseRunner(handle, { onCrash, isStopping }): void`. Waits on `handle.task()`. If it settles (resolves or rejects) while `!isStopping()`, it calls `onCrash(reason)` once.
  - `startKeepAlive({ baseUrl, intervalMs = 600000, fetchFn = fetch, log = console.warn }): () => void`. Returns `stop`, does nothing when `baseUrl` is empty, and uses an unref'd interval. Fetch errors are logged, never thrown.

- [ ] **Step 1: Write the failing tests** in `test/runtime.test.js`:
  - `health 200 while running` / `health 503 when stopped`: call the handler with fake `req`/`res` and check the status code and JSON `runner` field.
  - `crash triggers onCrash`: a handle whose `task()` resolves and `isStopping: () => false` → `onCrash` called once.
  - `planned stop does not`: the same with `isStopping: () => true` → not called.
  - `keep-alive pings /health`: call `startKeepAlive({ baseUrl: 'https://x.onrender.com', intervalMs: 10, fetchFn })`, wait 35 ms, stop. `fetchFn` called ≥ 2 times with `'https://x.onrender.com/health'`.
  - `keep-alive off without url`: `baseUrl: ''` → `fetchFn` never called.
  - `keep-alive survives fetch errors`: `fetchFn` rejects → no throw, `log` called.

- [ ] **Step 2: Run** `node --test test/runtime.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement `src/runtime.js`**, then rewire `src/index.js`:
  - `const runner = run(bot)` from `@grammyjs/runner`, after `setMyCommands`.
  - Health server uses `createHealthHandler({ isRunning: () => runner.isRunning() })`.
  - `superviseRunner(runner, { isStopping: () => stopping, onCrash: (r) => { console.error('❌ Bot stopped unexpectedly:', r); process.exit(1); } })`.
  - `startKeepAlive({ baseUrl: process.env.RENDER_EXTERNAL_URL })`.
  - On SIGINT/SIGTERM: set `stopping = true`, `await runner.stop()`, `store.close()`, close the health server.
  - Log on start: `🚲 @<username> is running (parallel mode). Press Ctrl+C to stop.`

- [ ] **Step 4: Run** `npm test`. Expected: all pass.

- [ ] **Step 5: Update `DEPLOY.md`.**
  - §5: the bot now pings itself every 10 min on Render; UptimeRobot is still recommended as a backup; `/health` returns 503 if the bot loop stopped, so Render restarts it.
  - Troubleshooting: "Don't sort or delete rows in Orders/Customers/Reviews while the bot is running. Filter views are fine. Hand edits show up in the bot within about a minute."

- [ ] **Step 6: Local smoke test.** Run `npm run demo`, open `http://localhost:<PORT>/health` with `PORT=3000` set. Expected: `"runner":"running"`. Press Ctrl+C. Expected: a clean exit with no "stopped unexpectedly" line.

- [ ] **Step 7: Commit**
```bash
git add src/runtime.js src/index.js DEPLOY.md test/runtime.test.js
git commit -m "feat(runtime): supervised parallel runner, honest health check, self keep-alive"
```

---

### Task 5: Load check and deploy verification

**Files:**
- Test: `test/load.test.js`

**Interfaces:**
- Consumes: the `setup()` harness pattern from `test/flow.test.js` (copy the minimal parts needed: fake API, `text`, `tap`), and `createBot` with the sequentialize middleware from Task 3.

- [ ] **Step 1: Write the test** `20 customers ordering at once stay responsive`:
  - Wrap every memory-store method with a 100 ms delay to imitate Sheets writes.
  - Run 20 full customer flows (start → shop → item → checkout → skip location → landmark → phone → confirm) with `Promise.all`, timing each customer's flow.
  - Assert `orders.length === 20`, and the slowest flow is ≤ the single-customer flow time (measured first in the same test) + 2000 ms.
  - Print the single, median and slowest times with `console.log`.

- [ ] **Step 2: Run** `node --test test/load.test.js`. Expected: PASS, printing times where the slowest is close to the single time.

- [ ] **Step 3: Commit**
```bash
git add test/load.test.js
git commit -m "test: 20 simultaneous customers stay responsive"
```

- [ ] **Step 4: Deploy and check by hand** (owner, after merging to `master`; Render auto-deploys).
  - Render logs show `(parallel mode)`.
  - `https://delivery-bot-ezum.onrender.com/health` shows `"runner":"running"`.
  - Two phones order at the same time, and both get every reply within a couple of seconds.
  - After 20 minutes without use, the bot still answers immediately (keep-alive works).
