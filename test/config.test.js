import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createPrivateKey } from 'node:crypto';
import { loadConfig, normalizePrivateKey } from '../src/config.js';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

test('private key normalization survives common dashboard mangling', () => {
  const variants = {
    normal: privateKey,
    escapedNewlines: privateKey.replace(/\n/g, '\\n'),
    quoted: `"${privateKey.replace(/\n/g, '\\n')}"`,
    spacesInsteadOfNewlines: privateKey.replace(/\n/g, ' '),
  };
  for (const [name, value] of Object.entries(variants)) {
    assert.doesNotThrow(() => createPrivateKey(normalizePrivateKey(value)), `${name} should parse`);
  }
});

test('GOOGLE_CREDENTIALS_BASE64 accepts the whole service-account JSON', () => {
  const json = { client_email: 'bot@example.com', private_key: privateKey };
  const b64 = Buffer.from(JSON.stringify(json)).toString('base64');
  const { config, problems } = loadConfig({
    STORAGE: 'sheets',
    BOT_TOKEN: 'x',
    GOOGLE_SHEET_ID: 'sheet-id',
    GOOGLE_CREDENTIALS_BASE64: b64,
  });
  assert.equal(config.googleClientEmail, 'bot@example.com');
  assert.doesNotThrow(() => createPrivateKey(config.googlePrivateKey));
  assert.ok(!problems.some((p) => p.includes('not valid PEM')));
});

test('GOOGLE_CREDENTIALS_BASE64 also accepts only the PEM key', () => {
  const b64 = Buffer.from(privateKey).toString('base64');
  const { config } = loadConfig({
    STORAGE: 'memory',
    GOOGLE_CLIENT_EMAIL: 'bot@example.com',
    GOOGLE_CREDENTIALS_BASE64: `"${b64}"`,
  });
  assert.doesNotThrow(() => createPrivateKey(config.googlePrivateKey));
});

test('a missing GOOGLE_CREDENTIALS_FILE produces a clear config error', () => {
  const { problems } = loadConfig({
    STORAGE: 'sheets',
    BOT_TOKEN: 'x',
    GOOGLE_SHEET_ID: 'sheet-id',
    GOOGLE_CREDENTIALS_FILE: './does-not-exist-google-key.json',
  });
  assert.ok(problems.some((p) => p.includes('not readable')));
});

test('a broken private key produces a clear config error, not a crypto crash', () => {
  const { problems } = loadConfig({
    STORAGE: 'sheets',
    BOT_TOKEN: 'x',
    GOOGLE_SHEET_ID: 'sheet-id',
    GOOGLE_CLIENT_EMAIL: 'bot@example.com',
    GOOGLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nbroken\n-----END PRIVATE KEY-----',
  });
  assert.ok(problems.some((p) => p.includes('not valid PEM')));
});

test('appUrl: APP_URL wins, else RENDER_EXTERNAL_URL + /app, else empty', () => {
  const base = { BOT_TOKEN: '1:t', STORAGE: 'memory' };
  const quiet = (env) => {
    const w = console.warn;
    console.warn = () => {};
    try {
      return loadConfig(env).config.appUrl;
    } finally {
      console.warn = w;
    }
  };
  assert.equal(quiet({ ...base, APP_URL: 'https://x.test/shop', RENDER_EXTERNAL_URL: 'https://r.test' }), 'https://x.test/shop');
  assert.equal(quiet({ ...base, RENDER_EXTERNAL_URL: 'https://x.onrender.com/' }), 'https://x.onrender.com/app');
  assert.equal(quiet(base), '');
});
