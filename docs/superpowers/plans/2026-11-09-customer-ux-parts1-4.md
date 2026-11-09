# Customer UX Redesign (Parts 1–4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers see a clear, branded chat: a profile and welcome banner, a guided "Step N of 4" checkout, a payment guide with tap-to-copy numbers, and a live order tracker with Deep Pine + Mint picture cards.

**Architecture:**
- Customer messages switch to Telegram HTML through one escaping helper (`src/bot/html.js`).
- Pictures (welcome banner, tracker cards) are SVG templates rendered to PNG with `@resvg/resvg-js` and bundled Noto fonts (`src/render/`). They are cached as buffers and Telegram `file_id`s, and fall back to text when rendering fails.
- The order tracker is a small module (`src/core/tracker.js` pure stage logic, `src/bot/tracker.js` sending) called from the existing customer/ops handlers.
- Merchant, rider and dispatch messages are untouched.

**Tech Stack:** Node ≥ 20 ES modules, grammY 1.46 (`InputFile`, `Keyboard.persistent()`), `@resvg/resvg-js` 2.6.2, Noto Sans + Noto Sans Ethiopic (OFL), `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-09-customer-ux-redesign-design.md` — "Visual identity", "Shared rules", Parts 1–4. Owner choices made during brainstorming: welcome option A, progress style `▰▰▱▱`, payment guide picture **on tap**, tracker = kept headline + live picture card **with word labels**, palette Pine + Mint with logo yellow for "now".

## Global Constraints

- Colours: background `#0A2E25`, card `#0F362C`, mint `#4BE3A4` (done stages, decoration), yellow `#FFC72C` (current stage, main button, delivery time), text `#FFFFFF`, inactive bars `#25564A`.
- Logo: `image/apposto-profile-logo-640.png`, copied unchanged to `assets/images/logo.png`.
- Customer messages only use `parse_mode: 'HTML'`; every `{placeholder}` value is HTML-escaped (`&`, `<`, `>`). Merchant, rider and dispatch texts and formatting do not change.
- Every new or changed text exists in `en`, `om`, `am` (the existing i18n completeness test in `test/orders.test.js` enforces it). Oromo/Amharic are drafts for native review.
- Progress line format: `▰▰▱▱  Step 2 of 4` (filled `▰`, empty `▱`, two spaces, localized "Step {n} of 4").
- Bot description ≤ 512 characters, short description ≤ 120 characters, one trilingual version, set at startup.
- Tracker stage labels on the card: **Sent · Accepted · Paid · Rider · Coming · Done** (localized), 6 bars.
- Image render: one at a time; > 5 s or error → text-only fallback, error logged. Target ≤ 40 KB per PNG.
- Phone numbers are shown as text (tappable), never as `tel:` buttons.
- Never start the bot locally (`npm start` / `npm run demo`): the live token is in use on Render.
- `npm test` passes after every task. Reliability code from Part 0 (`sequentialize`, retries, in-memory tables, `src/core/lock.js`) stays as is.

## Review Focus

1. **Customer-typed text containing `<`, `&` or `>`** (landmark, special request, Telegram name, shop names) must not break or inject formatting. Expected: shown literally. (Tests in Tasks 1, 4.)
2. **Image rendering fails or is slow on Render's small CPU.** Expected: the customer still gets the same information as text, without waiting more than 5 s. (Tests in Tasks 2, 6.)
3. **The merchant confirms payment while a rider takes the job at the same moment.** Expected: exactly one live tracker card at the end, not two. (Test in Task 6.)
4. **Deleting the previous tracker card fails** (already deleted by the customer, or older than 48 h). Expected: ignored, and the new card is still sent. (Test in Task 6.)
5. **After a restart the bot doesn't know whether the bottom menu is showing.** Expected: the home screen re-sends it once. Customers never end up without bottom buttons. (Test in Task 3.)

---

### Task 1: HTML foundation for customer messages

**Files:**
- Create: `src/bot/html.js`
- Modify: `src/bot/notify.js` (`toCustomer` sends HTML via `th`; new `appendLine`)
- Test: `test/html.test.js`

**Interfaces:**
- Produces:
  - `esc(value): string`. HTML-escapes `&`, `<`, `>`. `null`/`undefined` → `''`, numbers → `String`.
  - `th(lang, key, params = {}, { raw = [] } = {}): string`. Same as `t()`, but every param value goes through `esc`, except the param names listed in `raw` (for HTML already built and escaped by code, such as account lines). Template text is trusted and may contain `<b>`, `<i>`, `<code>`.
  - `HTML = Object.freeze({ parse_mode: 'HTML' })`.
  - `appendLine(ctx, line, replyMarkup?)` in `notify.js`. For the message a button was pressed on:
    - Text message: `editMessageText(text + '\n\n' + line, { entities: msg.entities, reply_markup })`.
    - Photo message: `editMessageCaption({ caption: caption + '\n\n' + line, caption_entities: msg.caption_entities, reply_markup })`.
    - `line` is plain text. "message is not modified" errors are ignored, as in `stampMessage`.
  - `notify.toCustomer(order, key, params, other)` now sends `th(...)` with `parse_mode: 'HTML'` merged into `other`.

- [ ] **Step 1: Write failing tests** in `test/html.test.js`:
  - `esc` turns `a<b>&c` into `a&lt;b&gt;&amp;c`.
  - `th` escapes a param but keeps template tags. Use a temporary key via `_strings` monkeypatch, or the existing `orderPlaced` with `merchant: '<i>X</i>'` → contains `&lt;i&gt;X&lt;/i&gt;`.
  - `appendLine` keeps entities: a fake ctx with `callbackQuery.message = { text: 'Hi Bob', entities: [{ type: 'bold', offset: 3, length: 3 }] }` → `editMessageText` called with text `Hi Bob\n\nDone` and the same entities, and no `parse_mode`.
  - `appendLine` on a photo message calls `editMessageCaption` with `caption_entities`.
  - `toCustomer` passes `parse_mode: 'HTML'`, and a landmark param `<script>` arrives escaped (fake `api.sendMessage` collecting calls).
- [ ] **Step 2: Run** `node --test test/html.test.js`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `src/bot/html.js` and the `notify.js` changes. Replace `stampMessage` with `appendLine` only in **customer** handlers (`src/bot/customer.js` `cancelcart`, `confirm`, `ccancel`). Merchant and rider handlers keep `stampMessage`.
- [ ] **Step 4: Run** `npm test`. Expected: all pass (`test/flow.test.js` expectations on customer text may need `parse_mode` tolerance only, not new wording).
- [ ] **Step 5: Commit** `feat(bot): HTML formatting helper and safe escaping for customer messages`.

---

### Task 2: Picture renderer and image cache

**Files:**
- Create:
  - `assets/fonts/NotoSans-Bold.ttf`, `assets/fonts/NotoSansEthiopic-Bold.ttf`, `assets/fonts/OFL.txt` (download from the notofonts GitHub releases or `notofonts.github.io` repo: `fonts/NotoSans/hinted/ttf/NotoSans-Bold.ttf`, `fonts/NotoSansEthiopic/hinted/ttf/NotoSansEthiopic-Bold.ttf`)
  - `assets/images/logo.png` (copy of `image/apposto-profile-logo-640.png`)
  - `src/render/cards.js`, `src/render/imageCache.js`
- Modify: `package.json` (`@resvg/resvg-js@^2.6.2`), `src/bot/notify.js` (`sendPhotoCached`)
- Test: `test/render.test.js`

**Interfaces:**
- Produces from `src/render/cards.js`:
  - `bannerSvg({ slogan, tagline, cta }): string` and `trackerSvg({ title, eta, stage, labels }): string`. `stage` is 1–6; bars `< stage` are mint, bar `== stage` yellow, the rest `#25564A`; label of the current stage is yellow. `eta` is a string such as `'20–30 min'` or `''`. All text is XML-escaped.
  - `renderPng(svg): Buffer` via `new Resvg(svg, { font: { fontFiles: [both fonts], loadSystemFonts: false, defaultFontFamily: 'Noto Sans' }, fitTo: { mode: 'width', value: 960 } }).render().asPng()`. Use `font-family="Noto Sans, Noto Sans Ethiopic"` in the SVG so Amharic falls back to the Ethiopic font.
  - Layouts:
    - Banner 1280×640: Pine background, two mint circles (opacity 0.18), the logo (base64 data URI) 120 px with rounded corners top-left, slogan (bold 64 px, white), tagline (32 px, white 85% opacity), yellow pill with `cta` (pine text).
    - Tracker 1280×520: card `#0F362C` on Pine, title (bold 56 px), eta (bold 36 px yellow), 6 bars (height 16, radius 8), labels (24 px) under the bars.
- Produces from `src/render/imageCache.js`:
  - `createImageCache({ render, timeoutMs = 5000, log = console.warn })`, where `render(args) → Buffer`. Returns:
    - `png(key, args): Promise<Buffer | null>`. Memoized by `key`. Renders one at a time (queue). Returns `null` on error or timeout and logs `🖼 render failed <key>: <reason>`.
    - `fileId(key): string | undefined` and `remember(key, fileId)`.
- Produces `notify.sendPhotoCached(chatId, key, args, other): Promise<Message | null>`:
  - Uses the remembered `file_id` if one exists. Otherwise sends `new InputFile(buffer, 'card.png')` and remembers `result.photo.at(-1).file_id`.
  - Returns `null` when there's no image (caller sends text instead) or when sending fails.
  - `createNotifier` takes `images` (the cache) and `render` functions via its options.

- [ ] **Step 1: Write failing tests** in `test/render.test.js`:
  - `renderPng(bannerSvg(...))` for en, om and am texts (am: `'ይዘዙ። ዘና ይበሉ።'`) returns a Buffer starting with the PNG signature `89 50 4E 47`, with `length < 120000`.
  - `trackerSvg` with title `'A & B'` contains `A &amp; B`. Stage 4 → exactly 3 mint bars, 1 yellow bar and 2 inactive bars (count fill colours in the SVG).
  - Cache: two `png('k', …)` calls render once. Two different keys requested at once never render concurrently (the fake render tracks max concurrency = 1). A render that throws → `null` plus one log line. A render slower than `timeoutMs: 50` → `null`.
  - `sendPhotoCached` sends an `InputFile` the first time and the remembered `file_id` string the second time (fake api).
- [ ] **Step 2: Run** `node --test test/render.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `npm install @resvg/resvg-js@^2.6.2`.
  - Download the fonts and the OFL licence, and copy the logo.
  - Write the two modules and `sendPhotoCached`.
  - Check the PNG sizes and note them in the report. If above 40 KB, reduce `fitTo` width to 800.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(render): Deep Pine + Mint banner and tracker cards with bundled fonts`.

---

### Task 3: Part 1: bot profile and welcome screen

**Files:**
- Create: `src/bot/profile.js`
- Modify:
  - `src/i18n.js`: new keys `botDescription`, `botShortDescription`, `welcomeCaption`, `bannerSlogan`, `bannerTagline`, `bannerCta`, `btnStartOrder`, `langSet`, `homeLine`. `botDescription`/`botShortDescription` are the same trilingual string for all three languages.
  - `src/bot/ui.js` (`mainMenu` persistent; `homeInline` first button `btnStartOrder` full width)
  - `src/bot/customer.js` (`showHome`, menu-shown tracking)
  - `src/bot/createBot.js` (create the image cache; pass it to notify/customer; warm the three banners in the background)
  - `src/index.js` (call `applyProfile` after `setMyCommands`; failure logged, not fatal)
  - `README.md` or `DEPLOY.md`: one short section, "Set the profile photo: @BotFather → /setuserpic → `image/apposto-profile-logo-640.png`"
- Test: extend `test/flow.test.js`; create `test/profile.test.js`

**Interfaces:**
- Produces:
  - `applyProfile(api): Promise<void>` calls `api.setMyDescription({ description })` and `api.setMyShortDescription({ short_description })` with the `en` value of the two keys.
  - Session gets `menuShown: boolean` (initial `false`).
  - `showHome(ctx, { justChoseLanguage = false })`:
    - If `!menuShown`, send `langSet` (when `justChoseLanguage`) or `homeLine`, with `mainMenu(lang)`, and set `menuShown = true`.
    - Then send the banner via `sendPhotoCached(chatId, 'banner:'+lang, …)` with caption `th(lang,'welcomeCaption',{brand})`, `parse_mode: 'HTML'` and `homeInline(lang)`.
    - If the photo is `null`, send the caption as an HTML text message with the same keyboard.
  - Any customer message that sends a different reply keyboard or `remove_keyboard` sets `menuShown = false` (location, landmark and phone steps; `outOfRange` restores the menu → `true`).
- Exact English copy:
  - `welcomeCaption`: `<b>Welcome to {brand}! 👋</b>\n\n1️⃣ Pick a shop and your food\n2️⃣ Send your location\n3️⃣ Pay the shop, and a rider brings it`
  - `bannerSlogan`: `Order. Relax. It's coming.`
  - `bannerTagline`: `Shashamane · delivered by bicycle`
  - `bannerCta`: `Start an order`
  - `btnStartOrder`: `🛍 Start an order`
  - `langSet`: `🌐 English ✅`
  - `homeLine`: `🏠 Home`
  - The trilingual description and short description are drafted by the implementer within the limits, with the brand name and what the bot does.

- [ ] **Step 1: Write failing tests.**
  - `test/profile.test.js`: `applyProfile` calls both methods. Description length ≤ 512, short description ≤ 120.
  - `test/flow.test.js`:
    - After `/start` → `lang:en`: one `sendMessage` with text `🌐 English ✅` whose `reply_markup.is_persistent === true`, then one `sendPhoto` whose caption contains `Welcome to` and whose inline keyboard's first button is `menu:order`. The old "Use the buttons below" message is **not** sent.
    - A second `/start` sends only the photo, with no menu line.
    - After reaching the location step, `/start` sends the `🏠 Home` line again.
    - When the fake API fails `sendPhoto`, the welcome arrives as a text message with the same inline keyboard.
- [ ] **Step 2: Run** the focused tests. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces. The image cache's `render` for `banner:<lang>` uses `bannerSvg` with the three banner keys in that language.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(customer): branded welcome banner, persistent main menu and bot profile`.

---

### Task 4: Part 2: guided checkout steps

**Files:**
- Modify:
  - `src/i18n.js`: new keys `stepOf` (`Step {n} of 4`), `cartNext` (`🛒 Next · {count} items · {total} ➜`), `cartNextRequest` (`🛒 Next · your request ➜`), `btnShops` (`⬅️ Shops`), `btnStepBack` (`⬅️ Back`), `btnStepCancel` (`❌ Cancel`), `btnEdit` (`✏️ Edit`), `almostDone` (`✅ Almost done!`), `payShopTag` (`pay the shop`), `cashRiderTag` (`cash to the rider`).
  - Changed texts: `askLocation`, `askLandmark`, `askPhone` and the menu hint, rewritten to the bold-instruction + example shape (desktop tip folded into `askLocation`).
  - `src/bot/ui.js`: `progressLine(lang, step)`, `renderMenu`, `renderSummary` (HTML, escaped values)
  - `src/bot/customer.js`: step keyboards, Back/Cancel/Edit handlers, "Almost done"
- Test: extend `test/flow.test.js`; create `test/ui.test.js`

**Interfaces:**
- Produces:
  - `progressLine(lang, step: 1..4): string`, e.g. `'▰▰▱▱  Step 2 of 4'`.
  - Step keyboards (reply, `resized`):
    - Location: `[📍 Send my location] / [⏭ Skip] / [⬅️ Back, ❌ Cancel]`
    - Landmark: `[⬅️ Back, ❌ Cancel]`
    - Phone: `[📞 Send my number] / [⬅️ Back, ❌ Cancel]`
  - Navigation:
    - Back: location → menu (re-sent as a new message, cart kept), landmark → location, phone → landmark.
    - Cancel: `resetFlow` + `showHome`.
    - `edit` callback on the summary → menu with the cart kept and `checkout` cleared.
    - Back/Cancel handlers (`hears(allTexts(...))`) are registered before the free-text handler and only act when `session.step` is a checkout step. Otherwise → `useMenu`.
  - Summary (HTML):
    - Title.
    - Shop.
    - Item lines.
    - `🍲 Food <b>{food}</b> · {payShopTag}`
    - `🚲 Delivery {fee}{distance} · 🧾 Service {service}`
    - `💵 <b>{cash}</b> · {cashRiderTag}`, where cash = delivery + service.
    - `📍 {landmark}`.
    - `📞 <code>{phone}</code>`.
    - ETA line.
  - Inline buttons: `✅ Place order` / `✏️ Edit` · `❌ Cancel`.
  - Before the summary: `almostDone` with `mainMenu` (sets `menuShown = true`), replacing the old `👍`.
  - The old separate `locDesktopHint` message with the inline Skip is no longer sent. The `skiploc` callback stays for old messages.

- [ ] **Step 1: Write failing tests.**
  - `test/ui.test.js`: `progressLine('en',1) === '▰▱▱▱  Step 1 of 4'` and `progressLine('en',4) === '▰▰▰▰  Step 4 of 4'`. The cart label shows the count (sum of quantities) and total. A request-only cart → `cartNextRequest`. `renderSummary` with landmark `'<b>x</b> & y'` contains `&lt;b&gt;x&lt;/b&gt; &amp; y` and contains `pay the shop` and `cash to the rider` with cash = delivery + service.
  - `test/flow.test.js`:
    - The location step is **one** message, whose reply keyboard contains a `request_location` button and the Back/Cancel texts.
    - From the landmark step, sending `⬅️ Back` re-sends the location step.
    - From the phone step, `❌ Cancel` clears the cart (a later `checkout` tap gets the stale alert) and sends the home screen.
    - Tapping `edit` on the summary shows the menu with the item still in the cart.
    - The full happy path still places one order (existing tests stay green).
- [ ] **Step 2: Run** the focused tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all pass, including the load test.
- [ ] **Step 5: Commit** `feat(customer): guided Step N of 4 checkout with Back, Cancel and a clear payment split`.

---

### Task 5: Part 3: payment guide

**Files:**
- Modify:
  - `src/i18n.js`: rewrite `payNow`, `refReceived`, `payNotFound` (HTML). New keys `payTapToCopy`, `btnWhereRef` (`❓ Where do I find the reference?`), `btnCallShop` (`📞 Call the shop`), `btnCancelOrder` (`❌ Cancel order`), `payGuideText` (text fallback explaining where Telebirr/CBE SMS show the reference), `shopPhoneLine` (`📞 {name}: {phone}`).
  - `src/bot/ui.js`: `merchantAccountsHtml(merchant, lang)`
  - `src/bot/ops.js` `doAccept`: customer message only
  - `src/bot/customer.js`: `payhelp:`, `callshop:` callbacks
  - `src/config.js`: `paymentGuidePath`, default `assets/images/payment-guide.png`
- Test: extend `test/flow.test.js`

**Interfaces:**
- `payNow` English:
  ```
  <b>✅ {merchant} accepted your order!</b>
  ▰▰▱  Payment · 2 easy steps

  <b>1️⃣ Send {food} to the shop</b>
  {accounts}
  {tapToCopy}

  <b>2️⃣ Send the reference number here</b>
  It's in the SMS you get after paying, e.g. <code>CK12AB34CD</code>

  🚲 Have <b>{fees} cash</b> ready for the rider.
  ```
  - `{accounts}` is pre-built HTML from `merchantAccountsHtml`: `📱 Telebirr: <code>…</code>`, `🏦 CBE: <code>…</code>`, `👤 Name: …`, each value escaped. When neither number exists, `📞 <code>{phone}</code>`.
  - It is passed with `th(lang, 'payNow', params, { raw: ['accounts'] })`. `doAccept` sends this message itself, then calls `tracker.update(order, { headline: null })` in Task 6.
  - Buttons: `payhelp:<id>` full width; `callshop:<id>` · `ccancel:<id>`.
- `payhelp:<id>`: if the file at `config.paymentGuidePath` exists, `replyWithPhoto(new InputFile(path))` with the caption `payGuideText`. Otherwise reply `payGuideText` as text. Any customer may tap it; it reveals nothing private.
- `callshop:<id>`: only the order's customer (`customerGuard`). Replies `shopPhoneLine` with the merchant's name and phone.

- [ ] **Step 1: Write failing tests** in `test/flow.test.js`:
  - After the merchant accepts, the customer message has `parse_mode: 'HTML'`, contains `<code>0911111111</code>`, and has the buttons `payhelp:<id>`, `callshop:<id>` and `ccancel:<id>`.
  - Account name `Abebe & Sons` arrives as `Abebe &amp; Sons`.
  - `payhelp` with a missing file → a text reply containing `payGuideText`. With `config.paymentGuidePath` pointing at an existing PNG (`assets/images/logo.png`) → `sendPhoto`.
  - `callshop` by the customer → a reply containing the shop phone. By a stranger → the not-allowed alert.
  - Sending a reference still reaches the merchant (existing tests).
- [ ] **Step 2: Run** the focused tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(customer): payment guide with tap-to-copy accounts and a where-is-my-reference help`.

---

### Task 6: Part 4: live order tracker

**Files:**
- Create: `src/core/tracker.js`, `src/bot/tracker.js`
- Modify:
  - `src/storage/schema.js`: Orders `['tracker_msg_id', 'trackerMsgId', 'str']`
  - `src/i18n.js`: keys `stageSent`/`stageAccepted`/`stagePaid`/`stageRider`/`stageComing`/`stageDone` (bar labels), `cardTitle1..6`, `timeline1..6` (timeline lines), headline keys `hlPaid`, `hlRider`, `hlComing`, `hlDone`, `btnCallRider` (`📞 Call rider`), `riderPhoneLine`, `cashReady`.
  - `src/bot/createBot.js`: create the tracker and pass it to `ops` and `customer`
  - `src/bot/customer.js`: after placing an order, `tracker.update(order)` with the existing `orderPlaced` as headline
  - `src/bot/ops.js`: accept (headline = the payment message from Task 5), payment confirmed, rider assigned, picked up, delivered (before the rating question), reject/cancel (`tracker.close`)
  - `DEPLOY.md`: "Before this version goes live, run `npm run setup-sheet` once (adds the `tracker_msg_id` column)."
- Test: `test/tracker.test.js`; extend `test/flow.test.js`

**Interfaces:**
- `src/core/tracker.js` (pure):
  - `trackerStage(order): 1..6 | null`:
    - `PLACED` → 1
    - `ACCEPTED`, `PAYMENT_SUBMITTED` → 2
    - `CONFIRMED`/`READY` without `riderId` → 3
    - with `riderId` (not picked up) → 4
    - `PICKED_UP` → 5
    - `DELIVERED` → 6
    - `REJECTED`/`CANCELLED` → `null`
  - `timeline(lang, stage): string` builds 6 lines: `✅` for `< stage`, `🟢` for `== stage`, `⚪` for `> stage` (stage 6: all ✅).
- `src/bot/tracker.js`: `createTracker({ api, store, notify, images, config, insights })` returns:
  - `update(order, { headline })`. `headline` is `{ text, other }`, already-built HTML, or `null` when the caller has already sent it. Runs inside `withLock('tracker:' + order.id)`, re-reading the order first, and:
    1. sends the headline if given;
    2. deletes `order.trackerMsgId` if set (errors ignored);
    3. sends the card via `notify.sendPhotoCached(customerId, 'track:'+lang+':'+stage+':'+eta, …)`:
       - caption (HTML): rider line (`<b>{rider}</b> · 📞 {phone}`) when stage ≥ 4, `timeline`, `🕒 {eta}` when not empty, and `cashReady` with the delivery + service amount;
       - buttons: `callrider:<id>` (stage 4–5) and `menu:help`;
       - on `null` it sends the same caption as an HTML text message;
    4. saves `trackerMsgId` of the sent message with `store.updateOrder`.
    - ETA text: stages 1–3 use `insights.eta(merchant, order.distanceKm)`, stages 4–5 use `estimateRide(order.distanceKm, config)`, stage 6 uses `''`. Format `'{min}–{max} min'` (localized `min`).
  - `close(order, headline)`: under the same lock, deletes the card if any, sends the headline, and clears `trackerMsgId`.
- `callrider:<id>`: only the order's customer. Replies `riderPhoneLine` with the rider's name and phone.

- [ ] **Step 1: Write failing tests.**
  - `test/tracker.test.js`: the full `trackerStage` table (including `CONFIRMED` with and without a rider), and `timeline('en', 4)` has 3 ✅, 1 🟢 and 2 ⚪.
  - `test/flow.test.js`:
    - After the order is placed, the customer gets the `orderPlaced` text and then a `sendPhoto` card, and `order.trackerMsgId` equals that message's id.
    - After payment confirmation, `deleteMessage` is called with the previous card's id and a new card is sent. Only one card is live (`trackerMsgId` updated).
    - `Promise.all([merchant confirms payment, rider takes the job])` (the rider is allowed only after confirmation, so: payment confirmed, then `Promise.all([rider take, merchant ready])`) ends with exactly one undeleted card: every card except the last was deleted.
    - `deleteMessage` failing (fake returns 400) → the new card is still sent.
    - `sendPhoto` failing → the card arrives as text with the same timeline.
    - Merchant reject → the card is deleted and the rejected headline is sent. Customer cancel → the same.
    - `callrider` by the customer → the rider's phone. By a stranger → the not-allowed alert.
- [ ] **Step 2: Run** the focused tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Replace the old separate customer messages (`payConfirmed` + `etaConfirmed`, `riderAssigned`, `pickedUp` + `etaOnTheWay`, `delivered`) with tracker headlines carrying the same information.
- [ ] **Step 4: Run** `npm test`. Expected: all pass, including the load test.
- [ ] **Step 5: Commit** `feat(customer): live order tracker with a kept headline and a Deep Pine + Mint card`.
