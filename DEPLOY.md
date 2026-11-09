# Deploy on Render (free web service)

This bot uses Telegram **long polling**, so it does not need incoming traffic. Render's free
**Background Worker** plan does not exist, so we deploy it as a **free Web Service** with a tiny
`/health` endpoint and keep that endpoint warm with a free pinger.

```
Telegram  <--long poll-->  Render free Web Service  --->  Google Sheets
                                   ^
                        pinger every 5 min (/health)
```

**Cost:** $0. Render gives 750 free instance-hours per workspace per month; one always-on service
uses about 720–744, so keep this as your only always-on free service.

> Later, if you want zero sleep and no pinger, switch the same repo to a **Background Worker**
> (`type: worker`, `plan: starter`, ~$7/month) and remove the `healthCheckPath`.

---

## 1. One-time Google setup (on your computer)

Do this locally before deploying. Render will only read the sheet; it will not create it.

1. Create the Google service account and download `google-key.json` (README section 2a).
2. Create the Google Sheet and **share it as Editor** with the service account email
   (`client_email` inside `google-key.json`).
3. Put the sheet id in your local `.env` as `GOOGLE_SHEET_ID`, then create the tabs:

   ```bash
   npm run setup-sheet
   ```

   You should see `✓ Merchants ok`, `✓ Menu ok`, etc.
4. Add your shops, menu items and riders to the tabs (README section 3).

---

## 2. Create the Render service

### Option A — Blueprint (recommended)

1. Push this repo to GitHub (it is already at `Algo-chan/Apposto`).
2. In the Render Dashboard: **New → Blueprint**.
3. Connect the repository. Render reads `render.yaml` and shows one service.
4. Fill in the secret values Render asks for (table below), then **Apply**.

### Option B — Manual

**New → Web Service**, connect the repo, then use:

| Setting | Value |
|---|---|
| Language | Node |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Instance Type | Free |
| Health Check Path | `/health` |
| Region | Frankfurt (closest to Ethiopia) |
| Auto-Deploy | On Commit |

Add the environment variables below under **Environment**.

---

## 3. Environment variables

| Key | Required | Value |
|---|---|---|
| `BOT_TOKEN` | yes | Token from @BotFather |
| `STORAGE` | yes | `sheets` |
| `GOOGLE_SHEET_ID` | yes | The id from the sheet URL (`/d/THIS_PART/edit`) |
| `GOOGLE_CREDENTIALS_FILE` | recommended on Render | `/etc/secrets/google-key.json` when using a Render **Secret File** (see below) |
| `GOOGLE_CLIENT_EMAIL` | recommended | `client_email` from `google-key.json` (auto-read from base64 JSON too) |
| `GOOGLE_CREDENTIALS_BASE64` | alternative | Base64 of the whole `google-key.json` (see below) |
| `GOOGLE_PRIVATE_KEY` | alternative | `private_key` PEM; only if you keep its newlines (see below) |
| `DISPATCH_CHAT_ID` | yes for riders | Group chat id, starts with `-100` (get it with `/myid` in the group) |
| `ADMIN_IDS` | yes for admin commands | Your Telegram id, comma-separated (`123,456`) |
| `SUPPORT_PHONE` | recommended | Phone shown to customers |
| `BRAND_NAME` | optional | Default: `Delivery` |

### Render Secret File (most reliable)

This avoids PEM/newline/base64 mangling completely.

1. Render Dashboard → your service → **Environment** → **Secret Files** → **Add Secret File**.
2. **Filename:** `google-key.json`
3. **Contents:** paste the entire contents of your local `google-key.json`.
4. Add the env var `GOOGLE_CREDENTIALS_FILE=/etc/secrets/google-key.json`
5. Remove `GOOGLE_CREDENTIALS_BASE64` and `GOOGLE_PRIVATE_KEY` (or leave them empty) to avoid confusion.
6. Save — Render restarts and reads the key from the mounted file.

The startup log will show `🔑 Google credentials: GOOGLE_CREDENTIALS_FILE (/etc/secrets/google-key.json)`.

### `GOOGLE_CREDENTIALS_BASE64` (alternative)

Dashboard env-var fields often destroy PEM newlines, which causes
`error:1E08010C:DECODER routines::unsupported`. Base64 is a single safe line:

**Windows PowerShell**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("google-key.json"))
```

**macOS / Linux**
```bash
base64 -w0 google-key.json
```

**Any OS (Node)**
```bash
node -e "process.stdout.write(require('fs').readFileSync('google-key.json').toString('base64'))"
```

Copy the output into `GOOGLE_CREDENTIALS_BASE64`. The app decodes it, reads `client_email` and
`private_key`, and derives `GOOGLE_CLIENT_EMAIL` automatically if you leave that var empty.
Treat this value as a secret.

### `GOOGLE_PRIVATE_KEY` (alternative)

If you prefer not to use base64, paste the **whole** `private_key` value including the
`-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----` lines. The app normalizes literal
`\n`, spaces, and surrounding quotes, but a truncated value cannot be recovered. When in doubt,
use `GOOGLE_CREDENTIALS_BASE64`.

Optional pricing/ETA settings (`DELIVERY_FEE_BASE`, `MAX_KM`, `SERVICE_FEE`, etc.) have code
defaults; add them only if you want to change the defaults (README section 5).

---

## 4. Deploy and verify

1. Render builds (`npm ci`) and starts (`npm start`).
2. Logs should show:

   ```
   📗 Connected to Google Sheets
   ❤️  Health server listening on 0.0.0.0:10000
   🚲 @your_bot is running. Press Ctrl+C to stop.
   ```

3. Open `https://<service-name>.onrender.com/health` — it must return `{"ok":true,...}`.
4. In Telegram, send `/start` to the bot and place a demo order.

**Run only one copy of the bot.** Stop the bot on your computer before starting Render (or the
other way around). Telegram allows one polling connection per token; a second one causes
`409 Conflict: terminated by other getUpdates request`.

### Bot profile

The bot sets its own description and short description (Afaan Oromoo, Amharic and English) every
time it starts. The profile photo is set once by hand:

Set the profile photo: @BotFather → /setuserpic → `image/apposto-profile-logo-640.png`

---

## 5. Keep the free service awake

Free web services sleep after 15 minutes without traffic. On Render the bot now pings its own
/health URL every 10 minutes to stay awake. A free external monitor is still recommended as a
backup:

- **UptimeRobot** (free): HTTP(s) monitor → `https://<service-name>.onrender.com/health` → every 5 min.
- **cron-job.org** (free): URL above → every 5 minutes.

The endpoint returns only `{ ok, uptime, runner }`; it exposes no order data. If the bot loop
stops unexpectedly, the process exits and Render starts it again — that is the restart path.
While the loop is stopped, `/health` returns 503, so you (or your monitor) can see that state;
the 503 itself does not make Render restart the service.

If the service still sleeps or Render restarts it, the bot reconnects automatically. Updates sent
while it is asleep stay queued in Telegram and are processed after wake-up.

---

## 6. Updating the bot

```bash
git add .
git commit -m "your change"
git push
```

Render redeploys automatically on push. Environment variables do not need to change.

### Updates that add sheet columns: run `npm run setup-sheet`

Some updates add columns to the sheet (for example the live order tracker added
`tracker_msg_id` to **Orders**). Render never changes the sheet itself, so after such an update
run this once on your computer, against the same `GOOGLE_SHEET_ID`:

```bash
npm run setup-sheet
```

It only adds missing columns (on the right) and missing tabs; your rows stay. It prints
`~ Orders: added columns tracker_msg_id` for what it added and `✓ Orders ok` when nothing was
missing, so running it again is harmless.

If a column is missing, the bot still starts, but the Render log shows one line per tab just
before `📗 Connected to Google Sheets`, for example:

```
⚠️ Orders is missing columns: tracker_msg_id — run: npm run setup-sheet
```

Until you run it, whatever belongs in that column is not saved (for `tracker_msg_id`: after a
restart, old tracker cards are not deleted and a customer may see two). Run
`npm run setup-sheet`, then restart the service (Render → **Manual Deploy → Restart service**)
and check the line is gone.

### Payment guide picture

The **❓ Where do I find the reference?** button under the payment message sends a picture of a
real payment SMS with the reference number marked, then the written steps. Put it here:

```
assets/images/payment-guide.png
```

- Use a screenshot of a Telebirr or CBE confirmation SMS. **Blur names, phone numbers, account
  numbers and balances** — only the reference number (e.g. `CK12AB34CD`) needs to stay readable.
- **Commit it to git** (`git add assets/images/payment-guide.png`, commit, push). Render's disk is
  wiped on every deploy, so a file copied onto the server by hand disappears.
- Without the file the button still works: the customer gets the written steps only.
- To use another file name or folder, set `PAYMENT_GUIDE_PATH`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Missing tab "Merchants" in the spreadsheet` | Run `npm run setup-sheet` locally against the same `GOOGLE_SHEET_ID` |
| `⚠️ Orders is missing columns: …` in the log | The sheet is older than the code: run `npm run setup-sheet` locally, then restart the service (section 6) |
| "Where do I find the reference?" sends text only, no picture | `assets/images/payment-guide.png` is missing from git: add it, commit, push (section 6) |
| `DECODER routines::unsupported` / `ERR_OSSL_UNSUPPORTED` | The private key lost its newlines or was truncated. Use a **Render Secret File** (above), or set `GOOGLE_CREDENTIALS_BASE64` and remove `GOOGLE_PRIVATE_KEY` |
| `Source: GOOGLE_PRIVATE_KEY` in the startup error | The app did not see `GOOGLE_CREDENTIALS_BASE64` (wrong name, blank, or not saved). Check the exact spelling `GOOGLE_CREDENTIALS_BASE64`, or switch to a Secret File |
| `409 Conflict: terminated by other getUpdates request` | Another copy is polling with the same token; stop your local bot |
| Deploy fails health check | The app must bind `$PORT`; keep the health server code in `src/index.js` and use `npm start` |
| Bot does nothing, logs fine | Check `BOT_TOKEN`, then send `/myid`; make sure the bot is not blocked |
| Riders get no jobs | Set `DISPATCH_CHAT_ID` and add the bot to the group; each rider must press Start once privately |
| Orders or customers look wrong after a sheet edit | Don't sort or delete rows in Orders/Customers/Reviews while the bot is running. Filter views are fine. Hand edits show up in the bot within about a minute |
| Service sleeps anyway | Pinger interval must be under 15 minutes; check the monitor is actually running |

Useful logs: Render Dashboard → your service → **Logs**. Every send failure is logged without
crashing the order flow.
