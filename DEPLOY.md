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
| `GOOGLE_CLIENT_EMAIL` | yes | `client_email` from `google-key.json` |
| `GOOGLE_PRIVATE_KEY` | yes | `private_key` from `google-key.json` (see below) |
| `DISPATCH_CHAT_ID` | yes for riders | Group chat id, starts with `-100` (get it with `/myid` in the group) |
| `ADMIN_IDS` | yes for admin commands | Your Telegram id, comma-separated (`123,456`) |
| `SUPPORT_PHONE` | recommended | Phone shown to customers |
| `BRAND_NAME` | optional | Default: `Delivery` |

**Do not set `GOOGLE_CREDENTIALS_FILE`** on Render — there is no `google-key.json` in the repo.
`GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY` replace it.

### `GOOGLE_PRIVATE_KEY`

Open `google-key.json` and copy the **whole** `private_key` value, including:

```
-----BEGIN PRIVATE KEY-----
...several lines...
-----END PRIVATE KEY-----
```

Paste it into the Render env var. Render accepts multiline values. If your dashboard/editor turns
it into a single line with `\n` escapes, that is also fine — the app converts `\n` back to real
newlines on startup.

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

---

## 5. Keep the free service awake

Free web services sleep after 15 minutes without traffic. Create a free monitor that calls the
health URL more often than that:

- **UptimeRobot** (free): HTTP(s) monitor → `https://<service-name>.onrender.com/health` → every 5 min.
- **cron-job.org** (free): URL above → every 5 minutes.

The endpoint returns only `{ ok, uptime }`; it exposes no order data.

If the service still sleeps or Render restarts it, the bot reconnects automatically. Updates sent
while it is asleep stay queued in Telegram and are processed after wake-up.

---

## 6. Updating the bot

```bash
git add .
git commit -m "your change"
git push
```

Render redeploys automatically on push. Environment variables and the Google Sheet do not need
to change.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Missing tab "Merchants" in the spreadsheet` | Run `npm run setup-sheet` locally against the same `GOOGLE_SHEET_ID` |
| `GOOGLE_PRIVATE_KEY` / `DECODER routines::unsupported` | Key was truncated or quotes were included; paste the full key without surrounding quotes |
| `409 Conflict: terminated by other getUpdates request` | Another copy is polling with the same token; stop your local bot |
| Deploy fails health check | The app must bind `$PORT`; keep the health server code in `src/index.js` and use `npm start` |
| Bot does nothing, logs fine | Check `BOT_TOKEN`, then send `/myid`; make sure the bot is not blocked |
| Riders get no jobs | Set `DISPATCH_CHAT_ID` and add the bot to the group; each rider must press Start once privately |
| Service sleeps anyway | Pinger interval must be under 15 minutes; check the monitor is actually running |

Useful logs: Render Dashboard → your service → **Logs**. Every send failure is logged without
crashing the order flow.
