# Customer experience redesign: design spec

Date: 2026-11-09
Status: Parts 1–4 approved by the owner; Part 0 added at the owner's request ("don't let it get busy and stuck")

## Why

Customers struggle at every step: getting started, checkout, paying, and knowing what happens after they order. The bot works, but every message is plain text, nothing tells people where they are in the process, and paying (send money, then type a transaction reference) is unfamiliar to most.

Goal: a customer who has never used the bot can order and pay without calling for help.

## Scope

In scope: only messages the **customer** sees.

Also in scope: Part 0, reliability for the whole bot (all users), because it must not get busy or stuck.

Out of scope: merchant, rider and dispatch-group message wording (unchanged), a Mini App, making sessions survive restarts, more than one server instance, the optional how-to video (Part 5, done later once a recording exists).

## Visual identity

Telegram controls chat colours, bubbles and the blue bottom-menu buttons. Our colours appear only in the **images** the bot sends (profile photo, welcome banner, tracker cards).

| Role | Colour |
|---|---|
| Background | Deep Pine `#0A2E25` |
| Card / panel | `#0F362C` |
| Accent (done stages, decoration) | Mint `#4BE3A4` |
| "Now" highlight (main button, current stage, delivery time) | Logo yellow `#FFC72C` |
| Text | White `#FFFFFF` |
| Inactive bars | `#25564A` |

Logo: `image/apposto-profile-logo.png` (and the 640 px copy), used unchanged. The red in the logo is used nowhere else.

Style: rounded cards, soft mint circles in the background, bold short headlines, friendly tone. These are general patterns from apps like Wolt and Swiggy, not their branding.

## Shared rules for all parts

1. **HTML formatting for customer messages only.** Customer messages are sent with `parse_mode: 'HTML'`. Merchant, rider and dispatch messages keep sending plain text.
2. **Everything people type is escaped.** A new translation helper fills `{placeholders}` with HTML-escaped values (`<`, `>`, `&`). Landmark, special request, names, shop names and payment refs always go through it. Pre-formatted blocks built in code (item lines, account lines) escape their own parts before adding tags.
3. **Formatting survives button taps.** When a button appends a line to a customer message (cancelled, placed), the edit keeps the original formatting by re-sending the message's `entities` (or `caption_entities` for a photo) instead of `parse_mode`, and appends plain text at the end.
4. **Copy boxes.** Account numbers, phone numbers and order IDs are wrapped in `<code>`. In Telegram, tapping these copies them.
5. **Phone buttons.** Telegram buttons can't open the phone dialler. "📞 Call the shop / rider" buttons reply with the number, and the number in that reply is tappable to call.
6. **Three languages.** Every new or changed text exists in `en`, `om` and `am`. The Oromo and Amharic are drafts and need a native speaker's review before launch, like the existing text.

## Part 0: Stay fast and never get stuck (built first)

The owner's requirement: this kind of bot often gets busy or stuck while people use it, so that must be designed against on purpose. Part 0 ships **before** Part 1, because Parts 1–4 add images and more messages, which add load.

### What can make this bot slow or stuck today (found in the code)

| # | Cause | Effect |
|---|---|---|
| 1 | `bot.start()` handles updates **one at a time** for everybody | One slow action (a Sheets call takes 0.5–2 s; an image will too) makes every other user wait. With 10 people active, taps feel dead. |
| 2 | Every order read **downloads the whole Orders tab** (`readAll('Orders')` in `getOrder`, `updateOrder`, `listOrders`, `findOrderByPaymentRef`). Customers and Reviews work the same way. | Slower every day as the tabs grow. One payment reference alone triggers 4+ full downloads. |
| 3 | Google Sheets allows about **60 reads per minute**. Cause 2 burns through that quickly. | Under load Google answers "429 too many requests" and actions fail with "Something went wrong". |
| 4 | Sheets and Telegram calls have **no timeout or retry** | One hung request freezes the queue (cause 1), so the whole bot looks dead. A Telegram "too many messages" reply drops the message. |
| 5 | Some buttons are answered only **after** slow work | The button keeps spinning, so people tap again and create duplicates. |
| 6 | Render free **sleeps after 15 minutes** without visitors (polling doesn't count) | The bot is silent until something wakes it. |
| 7 | If the polling loop crashes, the process stays up | `/health` says OK while the bot is dead. Render never restarts it. |
| 8 | Sessions live in memory | After a restart or deploy, people in the middle of checkout tap old buttons and hit a dead end. |
| 9 | (new with this redesign) Drawing images on Render free's tiny CPU share | Each new image costs CPU. Without caching it would slow everything (cause 1). |

### Fixes

1. **Handle users in parallel, each user in order.** Switch from `bot.start()` to `@grammyjs/runner` with `sequentialize` keyed by chat ID. Different customers no longer wait for each other. One person's taps still run in order, so their session and double taps stay safe. The per-order lock (`src/core/lock.js`) keeps "two riders take the same job" safe. Single instance only, as today.
2. **Keep the Orders, Customers and Reviews tabs in memory.**
   - Load each tab once at startup into a map keyed by ID.
   - Reads come from memory, with no Sheets call.
   - Writes go to the sheet (single row) and to memory together.
   - A background refresh every 60 s picks up hand edits made in the sheet. Rows the bot wrote in the last 2 minutes keep the bot's version, so a refresh can't undo a fresh change.
   - Merchants, Menu and Riders keep their existing cache.
3. **Timeouts and retries.**
   - Every Sheets call has a 10 s timeout.
   - Up to 3 retries with growing, randomised waits on 429, 5xx, network errors and timeouts.
   - Telegram calls use `@grammyjs/auto-retry`, which waits out "too many requests" and retries network errors.
4. **Buttons never spin.** A small middleware answers any button tap that a handler didn't answer, once the handler finishes. "Place order" answers first with "⏳" and then does the work. Other buttons become fast because reads come from memory (fix 2). A second tap on Place order while the first is running is ignored, because the same chat runs in order and the step has already moved on.
5. **Stay awake.** On Render, the bot pings its own public `/health` every 10 minutes (`RENDER_EXTERNAL_URL`, which Render provides). An external pinger (UptimeRobot) is still recommended as a backup.
6. **Die loudly so Render can restart it.** If the runner stops unexpectedly, the process exits with an error and Render starts it again. `/health` reports unhealthy (503) when the runner isn't running.
7. **Friendlier recovery after a restart.** A tap on an old button with no session shows "This menu is old" **plus** the home screen, instead of only an alert. Persistent sessions are out of scope for now.
8. **Cheap images.**
   - Rendered PNGs are cached in memory by (picture, language, stage, delivery time), and so is Telegram's `file_id` after the first upload.
   - Only one image renders at a time.
   - The 3 welcome banners are pre-drawn in the background at startup.
   - If drawing fails or takes over 5 s, the text-only version is sent.
9. **Logs that explain slowness.** Any update taking over 3 s is logged with its type and duration, and so is every Sheets retry, so "the bot was slow at 1 pm" can be checked in Render's logs.

### How we check it

- Tests: the memory store returns written orders without a Sheets read. Refresh doesn't overwrite fresh bot writes. Retry stops after 3 tries. A timeout rejects. Un-answered buttons get answered.
- An automated load test (`test/load.test.js`) runs 20 simulated customers ordering at the same time against the in-memory store and a fake Telegram API, and reports the slowest response. Target: nobody waits more than 2 s because of someone else.
- Manually, after deploy: two phones order at the same time. Both stay responsive, and `/health` shows the runner as running.

## Part 1: Profile and start screen

**Before Start (bot profile)**
- Profile photo: set once by hand in @BotFather (`/setuserpic`) with `image/apposto-profile-logo-640.png`. This is a manual step for the owner.
- "What can this bot do?" description (max 512 characters) and short "About" text (max 120): set at startup with `setMyDescription` / `setMyShortDescription`, next to the existing `setMyCommands`. One version contains all three languages, because most Telegram apps don't report Oromo or Amharic as the user's language.

**After choosing a language / pressing Start**
- **One welcome message**: a banner image (Deep Pine, logo, slogan in the customer's language, yellow "Start an order" pill) with this caption:
  - **Welcome to Apposto Delivery! 👋**
  - 1️⃣ Pick a shop and your food
  - 2️⃣ Send your location
  - 3️⃣ Pay the shop, and a rider brings it
- Inline buttons under it: **🛍 Start an order** (full width), **📦 My orders** + **☎️ Help**, **🌐 Language**.
- The bottom main menu (🛍 Order · 📦 My orders · ☎️ Help · 🌐 Language) becomes **persistent** (`is_persistent`), so it doesn't collapse.
- Telegram allows only one kind of keyboard per message. When the bottom menu needs to be (re)shown, for example after language choice or after checkout replaced it, a one-line message carries it: "🌐 English ✅" after choosing a language, otherwise "🏠 Home". The session remembers whether the menu is showing. After a restart it doesn't know, so it sends the line again.
- The separate "Use the buttons below 👇" message on the home screen is removed.

## Part 2: Checkout steps

Every step message has the same shape:

```
▰▰▱▱  Step 2 of 4
<b>📍 Where should we deliver?</b>
One-line instruction.
<i>Example</i>
```

| Step | Message | Buttons |
|---|---|---|
| 1 · Menu | Shop name, ⭐ rating, 🕒 delivery time, "Tap ➕ to add food", the cart | Inline: ➕ items (with ➖ qty), ✍️ Write a request, **🛒 Next · 3 items · 300 Br ➜**, ⬅️ Shops, 🗑 Clear |
| 2 · Location | Where to deliver; GPS tip; computer users can paste a Google Maps link or coordinates | Bottom: 📍 Send my location / ⏭ Skip / ⬅️ Back · ❌ Cancel |
| 3 · Landmark | What's near you, with an example | Bottom: ⬅️ Back · ❌ Cancel |
| 4 · Phone | Your phone number, with an example | Bottom: 📞 Send my number / ⬅️ Back · ❌ Cancel |
| Check | Order summary (below) | Inline: ✅ Place order / ✏️ Edit · ❌ Cancel |

- The cart button shows the item count and food total. With only a written request it reads "🛒 Next · your request ➜".
- Steps 2–4 put Back and Cancel in the **bottom** keyboard (not inline), so each step is one message. The current separate computer-tip message with an inline Skip is merged into step 2. *This differs from the mockup, which showed inline Back/Cancel. Telegram can't show both kinds of keyboard on one message.*
- **⬅️ Back**: location → menu (cart kept), landmark → location, phone → landmark. **✏️ Edit** on the summary → menu with the cart kept and checkout details cleared.
- **❌ Cancel**: clears the cart and shows the home screen.
- Before the summary, the "👍" message becomes "✅ Almost done!" and brings back the bottom main menu.
- The summary splits who gets paid what:
  - 🍲 Food **300 Br**, pay the shop
  - 🚲 Delivery 40 Br (~2.1 km) · 🧾 Service 10 Br
  - 💵 **50 Br**, cash to the rider
  - 📍 landmark · 📞 `phone` · 🕒 delivery time

## Part 3: Payment guide

Sent when the shop accepts (replaces the current `payNow` text):

```
<b>✅ Hamarawi Hotel accepted your order!</b>
▰▰▱  Payment · 2 easy steps

<b>1️⃣ Send 300 Br to the shop</b>
📱 Telebirr: <code>0911223344</code>
🏦 CBE: <code>1000123456789</code>
👤 Name: Hamarawi Hotel
Tap a number to copy it

<b>2️⃣ Send the reference number here</b>
It's in the SMS you get after paying, e.g. <code>CK12AB34CD</code>

🚲 Have <b>50 Br cash</b> ready for the rider.
```

Buttons: **❓ Where do I find the reference?** / **📞 Call the shop** · **❌ Cancel order**.

- ❓ sends the guide picture (`image/payment-guide.png`): a real Telebirr (and CBE) confirmation SMS with personal details blurred and the reference highlighted. **The owner supplies the screenshot.** Until it exists, ❓ replies with a text explanation instead.
- ❌ uses the existing customer-cancel rules (allowed while the order is placed or accepted).
- "Got it ✅" (reference received) and "payment not found" messages get the same formatting.

## Part 4: Order tracker

Each status update is sent as **two messages**:

1. **Headline** (kept in the chat, so it builds a short history), e.g. "**🚲 Rider assigned!** Order `261109-K4TQ` is coming soon."
2. **Live card** (replaces the previous card: the old one is deleted):
   - A **picture** (Deep Pine + Mint, yellow for the current stage) with the stage title, delivery time and 6 progress bars labelled **Sent · Accepted · Paid · Rider · Coming · Done**, in the customer's language.
   - Caption: rider name and `phone` when known, a vertical timeline (✅ done / 🟢 now / ⚪ to come), 🕒 delivery time, 💵 cash to have ready.
   - Buttons: **📞 Call rider** (once a rider is assigned) · **☎️ Help**.

| Stage | When | Headline message |
|---|---|---|
| 1 Sent | Order placed | existing "order sent" text, formatted |
| 2 Accepted | Shop accepts | the Part 3 payment message |
| 3 Paid | Shop confirms payment | 💚 Payment confirmed! |
| 4 Rider | Rider takes the job | 🚲 Rider assigned! |
| 5 Coming | Rider picks up | 🚲 On the way to you! |
| 6 Done | Delivered | ✅ Delivered, followed by the existing rating questions |

- Rejected or cancelled orders: the live card is deleted and the headline says why.
- The card's message ID is stored on the order in a new `tracker_msg_id` column (Orders tab). **`npm run setup-sheet` must be run once** before Part 4 goes live; it adds the column without touching data.
- Deleting the old card can fail (for example after 48 hours). That's ignored, and the new card is still sent.

**Drawing the pictures**
- The images are drawn by the bot when needed, from one SVG template, and converted to PNG with `@resvg/resvg-js` (new dependency).
- Bundled fonts (open licence): Noto Sans (Latin, for English and Oromo) and Noto Sans Ethiopic (Amharic), stored in `assets/fonts/`.
- The same renderer draws the Part 1 welcome banner (one per language).
- After the first upload, Telegram's `file_id` is cached in memory per (picture, language, stage, delivery time), so repeat images aren't uploaded again.
- If drawing fails, the card is sent as text only (the timeline still says everything), and the error is logged.
- Target size about 30–40 KB per image.

## Testing

- Automated (Node test runner, as today):
  - HTML escaping of every customer placeholder.
  - Progress line text for steps 1–4.
  - Cart button label (count, total, request-only).
  - Order status → tracker stage mapping, including cancel/reject.
  - Back/Cancel navigation between steps.
  - Formatting kept when a button appends a line.
  - The renderer returns a valid PNG for each language, including Amharic.
- Existing tests in `test/flow.test.js` are updated to the new texts.
- Manual, after each part: one full test order on a phone, in at least English and Amharic, before it goes live.

## Rollout

Parts ship in order 0 → 1 → 2 → 3 → 4. Each part can go live on its own.

Before going live, the owner:
- sets the profile photo in BotFather (Part 1),
- supplies the blurred SMS screenshot (Part 3, can follow later),
- runs `npm run setup-sheet` (Part 4),
- gets a native speaker to review the new Oromo and Amharic text.
