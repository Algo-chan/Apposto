# Customer Mini App: Design

Date: 2026-11-10
Status: approved in chat, waiting for review of this document

## Goal

Customers order inside a Telegram Mini App instead of tapping through chat steps. The app shows
the shops with banners and each shop's items with photos, name and price. The whole order happens
in the app: basket, location, landmark, phone, confirmation, waiting for the shop, payment details
and the payment reference.

The owner adds photos by sending them to the bot. The chat ordering stays as a backup.

## Decisions taken in chat

| Question | Decision |
|---|---|
| Who the app is for | Customers |
| How much happens in the app | The whole order, from browsing to the payment reference |
| How photos are added | The admin sends a photo to the bot with a caption (`I1`, `banner M1`) |
| Old chat ordering | Kept as a backup ("Order in chat") |
| Hosting | The same Render service as the bot, at `/app`. Plain HTML, CSS and JS with no build step |

## Out of scope

- Shop owners uploading their own photos (admins only for now).
- A map picker for the location (the "use my location" button or skip, the same as the chat).
- Opening hours, search, categories and item descriptions.
- Push updates over websockets (the app polls instead).
- Payment inside Telegram (Telegram Payments). Payment stays a manual transfer plus a reference.

## Part 1: Customer screens

All screens use Telegram's theme colours (light and dark) and the customer's bot language
(om/am/en, reusing `i18n.js` strings where they exist). If the customer never chose a language,
the app asks first and saves the choice to the Customers tab, as `lang:` does in the chat.

1. **Shops.** One card per active shop: the banner (or a plain card with the logo and the shop
   name if there is no banner), the name in the customer's language, and the usual
   preparation time (`prep_min`, hidden when empty). If the customer has an unfinished order, a strip at the top links to its
   status screen.
2. **Shop menu.** The banner at the top, then the active items two per row, each with a photo (or
   a placeholder), name, price, and `+` or `− n +`. The bottom bar (Telegram MainButton) reads
   "View basket · n items · total". One shop per basket, the same as the chat (switching shops
   asks before emptying the basket). Max 20 of one item, the same as the chat.
3. **Basket & details.** One scrolling page:
   - the items with − / +, and a special request box (`cleanText`, the same limit as the chat);
   - 📍 "Use my location" (Telegram `LocationManager`, falling back to browser geolocation) or
     Skip, as in the chat;
   - a landmark box;
   - a phone box, filled in from the Customers tab when known, plus a "Share my Telegram
     number" button (`WebApp.requestContact`).
   - When the location is known, the server returns the delivery fee and distance. If the
     customer is out of range, the page says so and blocks Continue.
4. **Check & confirm.** Items, food total (or "the shop will set the price" when there is a
   special request), delivery fee, service fee, ETA (`insights.eta`), and **Confirm order**.
5. **Order status.** Polls the server every 5 s while open:
   - PLACED: "Waiting for the shop to accept…"
   - ACCEPTED: the amount to pay, the shop's Telebirr number, CBE account and account name
     (each tap-to-copy), the "How to pay" picture (`assets/images/payment-guide.png`), and a
     payment-reference box with **Send**.
   - PAYMENT_SUBMITTED: "The shop is checking your payment…"
   - CONFIRMED / READY / PICKED_UP: preparing / ready / on the way, with the rider's name and
     phone once known.
   - DELIVERED / REJECTED / CANCELLED: a final message and a "Back to shops" button.
   - Closing the app loses nothing. The chat tracker card and messages carry on as today, and
     reopening the app shows the open order's status.

## Part 2: Adding photos through the bot

- Only users in `ADMIN_IDS` can do this, in a private chat with the bot. Photos from anyone else
  fall through to the existing handlers.
- The admin sends a **photo** (not a file) with a caption, matched case-insensitively with
  spaces trimmed:
  - `I1` sets the photo of menu item `I1`;
  - `banner M1` sets the banner of shop `M1`.
- The bot replies with the picture and `✅ Saved: I1 Firfir (Hamarawi Hotel)`. A new photo with
  the same caption replaces the old one.
- Errors, in plain words:
  - an unknown item or shop: "❌ No item I9 in the Menu tab";
  - no caption or a bad caption: "❌ Please add a caption like I1 or banner M1";
  - an image sent as a file (document): "❌ Send it as a photo, not a file".
- `/photos` (admins only) lists shops without a banner and active items without a photo.
- Storage: Telegram keeps the image, and the sheet stores the Telegram `file_id` in two new
  columns:
  - `Menu.photo` (`photo`, `str`);
  - `Merchants.banner` (`banner`, `str`).

  Clearing the cell removes the photo. The owner runs `npm run setup-sheet` once to add the
  columns.
- Sizes: from Telegram's `PhotoSize` list, the app uses the largest size ≤ 800 px wide for items
  and ≤ 1280 px for banners. The bot saves that size's `file_id`, so no image-resizing library is
  needed.
- Sheet writes: Merchants and Menu are read-only cached tabs today. The store gets
  `setMenuPhoto(itemId, fileId)` and `setMerchantBanner(merchantId, fileId)`. Each one updates a
  single cell (with `withRetry`) and clears the cache for that tab. `memoryStore` gets the same
  methods for tests.

## Part 3: Server, sharing the order logic, safety

### HTTP routes

These are added to the existing HTTP server in `src/index.js`, next to `/health`:

| Route | Purpose |
|---|---|
| `GET /app` and `/app/*` | Static files from `webapp/` (HTML, CSS, JS) |
| `GET /img/:fileId` | The photo: `getFile`, then download from Telegram, then an in-memory LRU cache (≈ 30 MB cap); `Cache-Control: public, max-age=31536000, immutable` |
| `GET /api/me` | Language, saved phone, the open order id (if any) |
| `POST /api/lang` | Save the language choice |
| `GET /api/shops` | Active shops: id, names, banner url, prep time |
| `GET /api/shops/:id/menu` | Active items: id, names, price, photo url |
| `POST /api/quote` | `{merchantId, lat?, lng?}` → distance, delivery fee, out-of-range, ETA |
| `POST /api/orders` | Place an order (see below) |
| `GET /api/orders/:id` | Status and the details for the status screen; payment details only from ACCEPTED on |
| `POST /api/orders/:id/ref` | Submit the payment reference |

- The app's URL is `${RENDER_EXTERNAL_URL}/app`, which Render sets itself, so the owner enters
  no new setting. `APP_URL` can override it for testing.
- With no URL, the bot does not show the app buttons and only offers chat ordering.

### Authentication

- Every `/api` request sends `Telegram.WebApp.initData` in an `Authorization: tma <initData>`
  header.
- The server checks the HMAC-SHA256 signature with the bot token (Telegram's WebApp
  validation), rejects `auth_date` older than 24 h, and takes the customer id only from the
  signed `user`. A failure returns 401, and the app shows "Please reopen the app from the bot".
- Customers can only read or change their own orders (`customerGuard`).

### Shared order logic (chat and app)

The "confirm" handler in `src/bot/customer.js` does several things after `service.placeOrder`:

- saves the customer;
- notifies the shop with Accept / Reject;
- notifies dispatch;
- starts the tracker.

`handlePaymentRef` likewise runs `service.submitPayment` and notifies the shop and dispatch.

Both move into one module, `src/bot/checkoutFlow.js` (in `bot/` because it needs `notify` and
`tracker`), with two functions:

- `placeAndNotify({ customer, merchant, cartItems, custom, checkout })`
- `submitRefAndNotify({ orderId, customerId, ref })`

The chat handlers and the API routes both call these, so both channels send identical messages.
The chat handler keeps its own chat-only replies (`📨 id`, the bottom menu).

### Server is the source of truth

- `POST /api/orders` takes item ids and quantities, the special request, lat/lng, landmark and
  phone.
- The server reloads the shop and the active menu, rebuilds the summary with `summarizeCart`,
  and recomputes the distance and fee with `roadDistanceKm`/`calcDeliveryFee`. It ignores any
  prices or totals from the page.
- It validates the phone (`normalizePhone`), clamps quantities to 1–20, and cleans texts with
  `cleanText`.
- It rejects with a clear code (`SHOP_CLOSED`, `ITEM_GONE`, `OUT_OF_RANGE`, `BAD_PHONE`,
  `EMPTY`) so the app can show the right message and reload the menu.
- **No double orders.** The app sends a random `requestId` per checkout. The server remembers
  `requestId → orderId` per customer for 10 minutes and returns the same order on a repeat.

### Bot changes

- 🛒 Order (the bottom keyboard) replies with a short message carrying an inline `web_app`
  button, "🛍 Open shop", and an "Order in chat" button. This works around a Telegram limit:
  apps opened from a *bottom-keyboard* `web_app` button get no signed `initData`, so the
  server couldn't tell who the customer is. Inline buttons and the menu button do get it.
- The chat's ☰ menu button is set to the app (`setChatMenuButton`).
- The home message's "Order" inline button becomes "🛍 Open shop" (`web_app`), with "Order in
  chat" (`menu:order`) next to it, which starts the current chat flow.
- A `message:contact` outside the chat's phone step saves the phone to the Customers tab and
  stays quiet, instead of the "use the menu" reply.

### Front end

- Files: `webapp/index.html`, `webapp/app.css`, `webapp/app.js`, plus Telegram's
  `telegram-web-app.js`. No framework, no build step.
- Screens switch inside one page. Telegram BackButton and MainButton are used for navigation and
  the main action.
- The basket and form fields are kept in `sessionStorage`, so a reload doesn't wipe them.
  Reads and writes are wrapped in try/catch.
- Errors:
  - while the server wakes up: "Connecting…" with a retry every few seconds, for up to about
    60 s;
  - a failed send keeps what the customer typed and offers Retry;
  - a 401 shows "reopen from the bot".

### Performance

- Shops and menus come from the store's in-memory cache (`CACHE_SECONDS`), so browsing adds no
  sheet reads.
- Photos are about 50–120 KB, cached on the server and on the phone.
- Free-plan sleep remains the main delay. The existing self keep-alive (`startKeepAlive`, every
  10 min) plus an UptimeRobot ping on `/health` keep the server awake. Render's paid plan removes
  the problem.

## Testing

Automated tests run with `node --test` and the memory store, with no live bot or sheet:

- `initData` validation: a good signature, a bad signature, an expired `auth_date`;
- caption parsing (`I1`, `i1`, ` banner m1 `, bad captions), photo size choice, `/photos` listing;
- API: shops and menu only list active ones; quote fee and out of range; place order computes the
  totals itself (tampered prices ignored); a repeated `requestId` returns one order; a gone item
  or closed shop is rejected; the status route hides payment details before ACCEPTED and hides
  other customers' orders; the ref route moves the order to PAYMENT_SUBMITTED;
- shared checkout: the chat confirm and the API order produce the same shop and dispatch
  notifications (fake `notify`);
- the existing tests keep passing.

Manual: after deploying, the owner opens the app on a phone and places a test order end to end.
The bot is never started locally, because the live token is on Render.

## Rollout

- **Step A: photos.**
  - Code: the two sheet columns, the store methods, photo upload through the bot, `/photos`,
    and the `/img` route.
  - Owner: deploy, run `npm run setup-sheet`, send the photos.
- **Step B: the mini app.**
  - Code: the API, the shared checkout module, `webapp/`, and the bot button changes.
  - Owner: deploy, then a test order on a phone.
