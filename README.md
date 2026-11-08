# 🚲 Delivery Order Bot (Telegram) — manual MVP

A Telegram bot for running a bicycle delivery service in Shashamane **before** the real app exists.
Customers order in **Afaan Oromo, Amharic or English**, shops accept and confirm payments, riders take jobs from a group,
and every order lands in **Google Sheets**, so you can count orders a day and invoice commission at month end.

Stack: Node.js 20+ · grammY · Google Sheets API · 19 automated tests.

---

## How an order flows

```
CUSTOMER                      SHOP                          DISPATCH GROUP (you + riders)
/start → language
🛍 Order → shop → items
📍 location → 🏠 landmark → 📞 phone
✅ Place order  ───────────▶  🔔 New order [Accept|Reject]   🆕 order posted [Cancel]
                              (custom request? types price)
💳 "Pay 620 Br to Telebirr…" ◀── Accept
sends reference CK12AB34CD ─▶ 💰 Check account [Received|Not]
💚 Payment confirmed    ◀──── Received  ─────────────────▶  🚲 New delivery [I'll take it]
                              👨‍🍳 [Ready for pickup]          rider taps → gets details + map pin
🚲 "Rider Kebede…"  ◀───────────────────────────────────────  [Picked up] → [Delivered]
✅ Delivered, pays 70 Br cash to rider                         ✅ "you earned 75 Br"
```

**Money model:** the customer pays the **shop directly** (Telebirr/CBE) for food, and pays the **rider in cash** for
delivery + service fee. Your commission (default 8%) is recorded on every order. Invoice shops monthly.

**Status names in the sheet:** `PLACED → ACCEPTED → PAYMENT_SUBMITTED → CONFIRMED → READY → PICKED_UP → DELIVERED`
(or `REJECTED` / `CANCELLED`).

---

## 1. Try it in 5 minutes (demo mode, no Google needed)

1. Install **Node.js 20+** from nodejs.org.
2. In Telegram, open **@BotFather** → `/newbot` → pick a name → copy the **token**.
3. In this folder:
   ```bash
   npm install
   cp .env.example .env        # Windows: copy .env.example .env
   ```
4. Open `.env` and paste `BOT_TOKEN=...`
5. Run `npm run demo`, open your bot in Telegram and send `/myid`. Copy your id.
6. In `.env` set `DEMO_MERCHANT_TELEGRAM_ID` and `ADMIN_IDS` to your id. Stop the bot (Ctrl+C) and run `npm run demo` again.
7. Press `/start` and order from "Demo Burger House". **You** are the customer *and* the shop: accept the order, send a fake reference like `CK12AB34CD`, and confirm it.
   (To test riders too: create a group, add the bot, set `DISPATCH_CHAT_ID` and `DEMO_RIDER_TELEGRAM_ID`.)

Demo data lives in memory and disappears when you stop the bot.

---

## 2. Real setup with Google Sheets

### a) Create the Google service account (one time, ~10 min)
1. Go to **console.cloud.google.com** → create a project (e.g. "delivery-bot").
2. **APIs & Services → Library** → enable **Google Sheets API**.
3. **APIs & Services → Credentials → Create credentials → Service account**. Name it, finish.
4. Open the service account → **Keys → Add key → JSON**. A file downloads.
5. Rename it `google-key.json` and put it in this folder. **Never upload it anywhere** (it's in `.gitignore`).

### b) Create the sheet
1. Create a new Google Sheet (e.g. "Delivery Orders").
2. Click **Share** → paste the service account email (looks like `delivery-bot@xxx.iam.gserviceaccount.com`, it's in the JSON file) → **Editor**.
3. Copy the sheet id from the URL: `docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`.

### c) Create the dispatch group
1. Create a Telegram group for you + your riders, add your bot to it.
2. Send `/myid` in the group → copy the **chat ID** (starts with `-100`).

### d) Fill `.env`
```
BOT_TOKEN=...
STORAGE=sheets
GOOGLE_SHEET_ID=...
GOOGLE_CREDENTIALS_FILE=./google-key.json
DISPATCH_CHAT_ID=-100...
ADMIN_IDS=your_id,cofounder_id
SUPPORT_PHONE=09...
```

### e) Create the tabs and run
```bash
npm run setup-sheet            # creates Merchants, Menu, Riders, Customers, Orders tabs
npm start
```

---

## 3. Adding shops, menu items and riders (edit the sheet)

**Merchants tab** (one row per shop):

| column | example | note |
|---|---|---|
| merchant_id | `M1` | short, unique, never change it |
| name_en / name_om / name_am | Burger House / … | om/am optional (falls back to English) |
| telegram_id | `512345678` | shop owner sends `/myid` to the bot. **Leave empty** if the shop has no Telegram: its messages go to your dispatch group and you (admin) press the buttons after calling them |
| phone | `0911…` | |
| lang | `om` / `am` / `en` | language for the shop's messages |
| telebirr / cbe_account / account_name | | shown to customers for payment |
| commission_pct | `8` | |
| lat / lng | `7.2001` / `38.5995` | shop location. In Google Maps, long-press the shop and copy the numbers. Needed for distance pricing |
| active | `TRUE` | `FALSE` hides the shop |

**Menu tab:** `item_id` (e.g. `I1`), `merchant_id`, `name_en/om/am`, `price`, `active`. Keep about 5–10 top items per shop.
Customers can always type a custom request too.

**Riders tab:** `telegram_id`, `name`, `phone`, `lang`, `active`.
Each rider must **open the bot privately and press Start once**, otherwise the bot can't send them job details.

Changes show up within 60 seconds, or instantly with `/reload`.

⚠️ **Don't sort or delete rows in the Orders tab.** Use *Data → Create a filter view* to look at it instead.

**Telegram Desktop:** desktop users get inline buttons in the message, an inline ⏭ Skip at the location step, and can paste a Google Maps link or coordinates (e.g. `7.2001, 38.5995`) instead of sharing GPS. `/menu` brings the menu back.

---

## 4. Daily use

| Command | Who | What |
|---|---|---|
| `/today` | admin | today's orders, commission, fees, rider pay, **what you earned** |
| `/active` | admin | all open orders and their status |
| `/cancel 261105-ABCD` | admin | cancel an order, and tell customer, shop and rider |
| `/reload` | admin | reload shops/menu/riders from the sheet |
| `/myid` | anyone | shows Telegram id + chat id |

**Monthly commission invoice:** in a new tab, per shop:
```
=SUMIFS(Orders!M:M, Orders!E:E, "M1", Orders!D:D, "DELIVERED", Orders!B:B, "2026-11*")
```
(M = commission, E = merchant_id, D = status, B = created_at; `"2026-11*"` = November 2026)

**Your 7-orders-a-day checkpoint:** make a tab with `=COUNTIFS(Orders!B:B, TEXT(A2,"yyyy-mm-dd")&"*", Orders!D:D, "DELIVERED")` for each date.

---

## 5. Settings (`.env`)

| Setting | Default | Meaning |
|---|---|---|
| `DELIVERY_FEE_BASE` | 60 | birr for the first `BASE_KM` |
| `BASE_KM` | 1.5 | |
| `PER_KM_FEE` | 15 | birr per extra started km |
| `MAX_KM` | 3 | bicycle limit: further orders are politely refused |
| `ROAD_FACTOR` | 1.3 | straight line × 1.3 ≈ road distance |
| `SERVICE_FEE` | 10 | birr per order |
| `RIDER_SHARE_PCT` | 75 | % of delivery fee paid to the rider |
| `DEFAULT_COMMISSION_PCT` | 8 | when a shop row has none |

If the customer skips sharing location, they pay the base fee and the rider calls them.

---

## 6. Run it 24/7 on a server

**Deploying on Render?** Follow [DEPLOY.md](DEPLOY.md) for the free Web Service + keep-alive setup.

Cheapest: a small VPS (Hetzner/DigitalOcean, ~$5/month), Ubuntu.
```bash
# on the server
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
git clone <your private repo> && cd delivery-bot && npm install --omit=dev
# copy .env and google-key.json with scp (NOT through git)
sudo npm i -g pm2
pm2 start src/index.js --name delivery-bot && pm2 save && pm2 startup
pm2 logs delivery-bot      # see what's happening
```
Run only **one** copy of the bot at a time (Telegram allows one polling connection per token).

---

## 7. Security built in (your HTB side will like this)

- **Every button checks who pressed it:** only the shop (or an admin) can accept/confirm, only the assigned rider can mark picked up/delivered, only admins can cancel or see reports. Tested with "stranger" attacks.
- **Race-safe job taking:** two riders tapping at once → exactly one gets it (per-order lock, tested).
- **No double processing:** state machine rejects invalid moves (e.g. confirming payment twice).
- **Anti fake-payment:** the shop must confirm the money **arrived in their own account** before cooking. The same reference number can't be reused on another order. "Not received" alerts the dispatch group.
- **Input validation:** phone numbers (09/07, +251), references (A–Z/0–9 only), prices, text length limits, control characters stripped.
- **Spreadsheet formula-injection guard:** user text starting with `= + - @` is neutralized, and data is written in RAW mode.
- **Secrets** only in `.env` / `google-key.json` (git-ignored). If your token leaks: @BotFather → `/revoke`.

Known limits (fine for the test phase): carts live in memory (a restart clears unfinished carts, not orders);
Google Sheets gets slow after many thousands of orders. That's the signal to move to PostgreSQL in the real app.

---

## 8. Translations

All texts are in `src/i18n.js`. **Ask a native Afaan Oromo and Amharic speaker to review them before launch**: just edit
the strings and keep the `{placeholders}`. `npm test` checks that every text exists in all 3 languages.

## 9. Project structure

```
src/
  core/orders.js        business rules: statuses, fees, commission, validation (no Telegram code)
  core/orderService.js  order actions with locking + permission guards
  storage/              Google Sheets store, in-memory store, sheet schema
  bot/customer.js       customer conversation
  bot/ops.js            shop, rider and admin actions
  bot/notify.js         message sending + fallbacks
  i18n.js               all texts in om / am / en
scripts/setup-sheet.js  creates the sheet tabs
test/                   unit + end-to-end tests (npm test)
```
`core/` has no Telegram code on purpose, so you can reuse it in the real app's backend later.
