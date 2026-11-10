// All settings come from environment variables (.env file). See .env.example.
import { createPrivateKey } from 'node:crypto';
import fs from 'node:fs';

/**
 * Hosting dashboards often mangle PEM values: newlines become spaces or literal "\n",
 * values get wrapped in quotes, or the whole thing arrives base64-encoded.
 * Rebuild a clean PEM (header + 64-char lines + footer) from whatever we got.
 */
export function normalizePrivateKey(raw) {
  if (!raw) return '';
  let key = String(raw).trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  key = key.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\r/g, '\n');
  const match = key.match(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/);
  if (!match) return key;
  const body = match[2].replace(/[^A-Za-z0-9+/=]/g, '');
  const lines = body.match(/.{1,64}/g) || [];
  return `-----BEGIN ${match[1]}-----\n${lines.join('\n')}\n-----END ${match[1]}-----\n`;
}

/** GOOGLE_CREDENTIALS_BASE64 may contain the whole google-key.json (easiest) or just the PEM key. */
function decodeCredentialsBase64(raw) {
  if (!raw) return null;
  let encoded = String(raw).trim();
  if (
    (encoded.startsWith('"') && encoded.endsWith('"')) ||
    (encoded.startsWith("'") && encoded.endsWith("'"))
  ) {
    encoded = encoded.slice(1, -1).trim();
  }
  const text = Buffer.from(encoded, 'base64').toString('utf8').trim();
  if (!text) return null;
  if (text.startsWith('{')) {
    try {
      const json = JSON.parse(text);
      return { email: json.client_email || '', key: json.private_key || '' };
    } catch {
      return null;
    }
  }
  return { email: '', key: text };
}

function num(env, name, def) {
  const v = env[name];
  if (v === undefined || v === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number (got "${v}")`);
  return n;
}

function idList(env, name) {
  return (env[name] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(env = process.env) {
  const storage = (env.STORAGE || 'sheets').toLowerCase();
  const hasBase64 = Boolean(
    env.GOOGLE_CREDENTIALS_BASE64 && String(env.GOOGLE_CREDENTIALS_BASE64).trim()
  );
  const fromBase64 = hasBase64 ? decodeCredentialsBase64(env.GOOGLE_CREDENTIALS_BASE64) : null;
  const credentialsSource = env.GOOGLE_CREDENTIALS_FILE
    ? 'GOOGLE_CREDENTIALS_FILE'
    : hasBase64
      ? 'GOOGLE_CREDENTIALS_BASE64'
      : env.GOOGLE_PRIVATE_KEY
        ? 'GOOGLE_PRIVATE_KEY'
        : 'none';
  const config = {
    botToken: env.BOT_TOKEN || '',
    storage,
    sheetId: env.GOOGLE_SHEET_ID || '',
    googleCredentialsFile: env.GOOGLE_CREDENTIALS_FILE || '',
    googleCredentialsSource: credentialsSource,
    googleCredentialsBase64Set: hasBase64,
    googleCredentialsBase64Decoded: Boolean(fromBase64),
    googleClientEmail: env.GOOGLE_CLIENT_EMAIL || fromBase64?.email || '',
    // When both are present, a valid base64 value wins over a mangled GOOGLE_PRIVATE_KEY.
    googlePrivateKey: normalizePrivateKey(
      hasBase64 ? fromBase64?.key || '' : env.GOOGLE_PRIVATE_KEY || ''
    ),

    // Telegram group where riders + you see jobs. Get the id with /myid inside the group.
    dispatchChatId: env.DISPATCH_CHAT_ID || '',
    adminIds: idList(env, 'ADMIN_IDS'),
    supportPhone: env.SUPPORT_PHONE || '',
    // Screenshot shown by the "Where do I find the reference?" button (text is used if the file is missing)
    paymentGuidePath: env.PAYMENT_GUIDE_PATH || 'assets/images/payment-guide.png',
    brandName: env.BRAND_NAME || 'Delivery',
    // The mini app's address (must be https). Render sets RENDER_EXTERNAL_URL itself, so on
    // Render nothing needs setting; empty = no app buttons, chat ordering only.
    appUrl:
      env.APP_URL ||
      (env.RENDER_EXTERNAL_URL ? `${String(env.RENDER_EXTERNAL_URL).replace(/\/+$/, '')}/app` : ''),

    // Money (birr)
    deliveryFeeBase: num(env, 'DELIVERY_FEE_BASE', 60),
    baseKm: num(env, 'BASE_KM', 1.5),
    perKmFee: num(env, 'PER_KM_FEE', 15),
    maxKm: num(env, 'MAX_KM', 3),
    roadFactor: num(env, 'ROAD_FACTOR', 1.3),
    serviceFee: num(env, 'SERVICE_FEE', 10),
    riderSharePct: num(env, 'RIDER_SHARE_PCT', 75),
    defaultCommissionPct: num(env, 'DEFAULT_COMMISSION_PCT', 8),
    cacheSeconds: num(env, 'CACHE_SECONDS', 60),

    // Delivery time estimate (minutes)
    defaultPrepMin: num(env, 'DEFAULT_PREP_MIN', 20),
    pickupMin: num(env, 'PICKUP_MIN', 5),
    rideMinPerKm: num(env, 'RIDE_MIN_PER_KM', 4.5),
    etaBufferMin: num(env, 'ETA_BUFFER_MIN', 5),
    defaultDistanceKm: num(env, 'DEFAULT_DISTANCE_KM', 2),
    // Ratings
    minReviewsToShow: num(env, 'MIN_REVIEWS_TO_SHOW', 5),
  };

  const problems = [];
  if (!config.botToken) problems.push('BOT_TOKEN is missing (get it from @BotFather)');
  if (!['sheets', 'memory'].includes(storage)) problems.push('STORAGE must be "sheets" or "memory"');
  if (storage === 'sheets') {
    if (!config.sheetId) problems.push('GOOGLE_SHEET_ID is missing');
    if (config.googleCredentialsFile) {
      try {
        fs.accessSync(config.googleCredentialsFile, fs.constants.R_OK);
      } catch {
        problems.push(
          `GOOGLE_CREDENTIALS_FILE is set but not readable: ${config.googleCredentialsFile} ` +
            '(on Render, upload the key as a Secret File at /etc/secrets/google-key.json)'
        );
      }
    }
    if (!config.googleCredentialsFile) {
      if (hasBase64) {
        if (!fromBase64) {
          problems.push(
            'GOOGLE_CREDENTIALS_BASE64 could not be decoded. Re-generate it (DEPLOY.md), or use a Render Secret File.'
          );
        } else if (!fromBase64.key) {
          problems.push(
            'GOOGLE_CREDENTIALS_BASE64 decoded but contains no private_key. Base64 the whole google-key.json file.'
          );
        }
      } else if (!config.googleClientEmail || !config.googlePrivateKey) {
        problems.push(
          'Set GOOGLE_CREDENTIALS_FILE (or GOOGLE_CREDENTIALS_BASE64, or GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY)'
        );
      }
      if (config.googlePrivateKey && !config.googleClientEmail) {
        problems.push('GOOGLE_CLIENT_EMAIL is missing (set it, or base64 the whole google-key.json).');
      }
      if (config.googlePrivateKey) {
        try {
          createPrivateKey(config.googlePrivateKey);
        } catch {
          problems.push(
            'The Google private key is not valid PEM. ' +
              `Source: ${credentialsSource}; key chars: ${config.googlePrivateKey.length}; ` +
              `header: ${config.googlePrivateKey.includes('-----BEGIN') ? 'yes' : 'no'}; ` +
              `footer: ${config.googlePrivateKey.includes('-----END') ? 'yes' : 'no'}. ` +
              'Use a Render Secret File (DEPLOY.md) or reset GOOGLE_CREDENTIALS_BASE64.'
          );
        }
      }
    }
  }
  if (!config.dispatchChatId) {
    console.warn('⚠️  DISPATCH_CHAT_ID not set: riders will not receive jobs until you set it.');
  }
  if (config.adminIds.length === 0) {
    console.warn('⚠️  ADMIN_IDS not set: admin commands (/today, /active, /cancel) are disabled.');
  }
  return { config, problems };
}
