import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyInitData, signInitData } from '../src/web/initData.js';

const TOKEN = '1:test';
const NOW = 1_800_000_000_000; // ms
const user = JSON.stringify({ id: 100, first_name: 'Abebe', last_name: 'K', language_code: 'en' });
const fresh = () => signInitData({ auth_date: String(NOW / 1000 - 60), query_id: 'Q1', user }, TOKEN);

test('accepts a correctly signed initData and returns the user', () => {
  const r = verifyInitData(fresh(), TOKEN, { now: NOW });
  assert.deepEqual(r.user, { id: '100', firstName: 'Abebe', lastName: 'K', languageCode: 'en' });
});

test('rejects a tampered user', () => {
  const tampered = fresh().replace(encodeURIComponent('"id":100'), encodeURIComponent('"id":200'));
  assert.notEqual(tampered, fresh());
  assert.equal(verifyInitData(tampered, TOKEN, { now: NOW }), null);
});

test('rejects initData signed for a different bot', () => {
  assert.equal(verifyInitData(fresh(), '2:other', { now: NOW }), null);
});

test('rejects initData older than 24 hours', () => {
  const old = signInitData({ auth_date: String(NOW / 1000 - 86401), user }, TOKEN);
  assert.equal(verifyInitData(old, TOKEN, { now: NOW }), null);
  const edge = signInitData({ auth_date: String(NOW / 1000 - 86400), user }, TOKEN);
  assert.ok(verifyInitData(edge, TOKEN, { now: NOW }));
});

test('rejects empty, garbage, a missing hash and a missing or broken user', () => {
  for (const bad of ['', 'abc', undefined, null, `auth_date=${NOW / 1000}&user=${encodeURIComponent(user)}`]) {
    assert.equal(verifyInitData(bad, TOKEN, { now: NOW }), null);
  }
  assert.equal(verifyInitData(signInitData({ auth_date: String(NOW / 1000) }, TOKEN), TOKEN, { now: NOW }), null);
  assert.equal(verifyInitData(signInitData({ auth_date: String(NOW / 1000), user: '{bad' }, TOKEN), TOKEN, { now: NOW }), null);
  assert.equal(verifyInitData(signInitData({ auth_date: String(NOW / 1000), user: '{}' }, TOKEN), TOKEN, { now: NOW }), null);
});
