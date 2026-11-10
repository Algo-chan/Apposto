// Telegram Mini App initData check. Telegram signs the data it hands the app (who the user is)
// with a key derived from the bot token, so the server can trust the user id in it.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
import crypto from 'node:crypto';

function dataCheckString(params) {
  return [...params.entries()]
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

function signature(params, botToken) {
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  return crypto.createHmac('sha256', secret).update(dataCheckString(params)).digest('hex');
}

/** { user: { id, firstName, lastName, languageCode } } when the signature and age are good, else null. */
export function verifyInitData(initData, botToken, { maxAgeSec = 86400, now = Date.now() } = {}) {
  if (!initData || typeof initData !== 'string' || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  const expected = Buffer.from(signature(params, botToken), 'hex');
  if (!crypto.timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || now / 1000 - authDate > maxAgeSec) return null;

  let user;
  try {
    user = JSON.parse(params.get('user') ?? '');
  } catch {
    return null;
  }
  if (!user || !Number.isSafeInteger(user.id)) return null;
  return {
    user: {
      id: String(user.id),
      firstName: String(user.first_name ?? ''),
      lastName: String(user.last_name ?? ''),
      languageCode: String(user.language_code ?? ''),
    },
  };
}

/** A signed initData string, as Telegram would build it (tests and the local preview). */
export function signInitData(fields, botToken) {
  const params = new URLSearchParams(fields);
  params.set('hash', signature(params, botToken));
  return params.toString();
}
