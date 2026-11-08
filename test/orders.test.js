import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition,
  calcDeliveryFee,
  calcCommission,
  calcRiderPay,
  platformEarnings,
  normalizePhone,
  normalizeRef,
  parseAmount,
  newOrderId,
  localTimestamp,
  roadDistanceKm,
  summarizeCart,
  cleanText,
} from '../src/core/orders.js';
import { toRow, fromRow } from '../src/storage/schema.js';
import { _strings, LANGS, t } from '../src/i18n.js';

const fees = { deliveryFeeBase: 60, baseKm: 1.5, perKmFee: 15, maxKm: 3 };

test('order state machine allows only valid moves', () => {
  assert.ok(canTransition('PLACED', 'ACCEPTED'));
  assert.ok(canTransition('PAYMENT_SUBMITTED', 'ACCEPTED')); // payment not found
  assert.ok(!canTransition('PLACED', 'DELIVERED'));
  assert.ok(!canTransition('DELIVERED', 'CANCELLED'));
  assert.ok(!canTransition('ACCEPTED', 'CONFIRMED')); // can't confirm without a reference
});

test('delivery fee by distance', () => {
  assert.deepEqual(calcDeliveryFee(null, fees), { fee: 60, outOfRange: false });
  assert.deepEqual(calcDeliveryFee(1.0, fees), { fee: 60, outOfRange: false });
  assert.deepEqual(calcDeliveryFee(1.5, fees), { fee: 60, outOfRange: false });
  assert.deepEqual(calcDeliveryFee(2.0, fees), { fee: 75, outOfRange: false });
  assert.deepEqual(calcDeliveryFee(3.0, fees), { fee: 90, outOfRange: false });
  assert.equal(calcDeliveryFee(3.1, fees).outOfRange, true);
});

test('money math', () => {
  assert.equal(calcCommission(500, 8), 40);
  assert.equal(calcCommission(455, 8), 36);
  assert.equal(calcRiderPay(60, 75), 45);
  assert.equal(platformEarnings({ commission: 40, serviceFee: 10, deliveryFee: 60, riderPay: 45 }), 65);
});

test('Ethiopian phone numbers', () => {
  assert.equal(normalizePhone('0911234567'), '0911234567');
  assert.equal(normalizePhone('+251 911 234 567'), '0911234567');
  assert.equal(normalizePhone('251711234567'), '0711234567');
  assert.equal(normalizePhone('911234567'), '0911234567');
  assert.equal(normalizePhone('0811234567'), null);
  assert.equal(normalizePhone('12345'), null);
});

test('payment references', () => {
  assert.equal(normalizeRef('ck12ab34cd'), 'CK12AB34CD');
  assert.equal(normalizeRef('FT 2430 1ABC DEF'), 'FT24301ABCDEF');
  assert.equal(normalizeRef('hello'), null); // too short / no digits
  assert.equal(normalizeRef('ABCDEFGHIJ'), null); // no digits
  assert.equal(normalizeRef('<script>1</script>'), null);
});

test('amount parsing', () => {
  assert.equal(parseAmount('450'), 450);
  assert.equal(parseAmount('1,200 birr'), 1200);
  assert.equal(parseAmount('-5'), null);
  assert.equal(parseAmount('abc'), null);
});

test('order id format uses Ethiopian date', () => {
  // 2026-11-04 22:30 UTC = 2026-11-05 01:30 in Ethiopia
  const id = newOrderId(new Date('2026-11-04T22:30:00Z'), () => 0);
  assert.equal(id, '261105-AAAA');
  assert.equal(localTimestamp(new Date('2026-11-04T22:30:00Z')), '2026-11-05 01:30:00');
});

test('road distance estimate', () => {
  const a = { lat: 7.2, lng: 38.6 };
  assert.equal(roadDistanceKm(a, a), 0);
  const d = roadDistanceKm(a, { lat: 7.21, lng: 38.6 }, 1.3); // ~1.11 km straight line
  assert.ok(d > 1.3 && d < 1.6, `got ${d}`);
  assert.equal(roadDistanceKm({ lat: null, lng: null }, a), null);
});

test('cart summary', () => {
  const menu = new Map([['I1', { id: 'I1', names: { en: 'Burger', om: 'Baargarii' }, price: 250 }]]);
  const s = summarizeCart({ items: { I1: 2, GONE: 1 }, custom: 'extra sauce' }, menu, 'om');
  assert.equal(s.total, 500);
  assert.equal(s.lines.length, 1);
  assert.equal(s.lines[0].name, 'Baargarii');
  assert.equal(s.custom, 'extra sauce');
  assert.equal(s.isEmpty, false);
});

test('text cleaning strips control chars and limits length', () => {
  assert.equal(cleanText('hi\u0000there', 50), 'hithere');
  assert.equal(cleanText('x'.repeat(500), 10).length, 10);
});

test('sheet rows: numbers stay numbers, phones keep leading zero, formulas neutralized', () => {
  const row = toRow('Orders', { foodTotal: 500, customerPhone: '0911234567', landmark: '=HYPERLINK("x")' });
  assert.equal(row.food_total, 500);
  assert.equal(row.customer_phone, '0911234567');
  assert.ok(row.landmark.startsWith("'="));
  const back = fromRow('Merchants', (h) => ({ commission_pct: '8', active: 'TRUE', lat: '' })[h]);
  assert.equal(back.commissionPct, 8);
  assert.equal(back.active, true);
  assert.equal(back.lat, null);
});

test('every text exists in all 3 languages with the same placeholders', () => {
  for (const [key, entry] of Object.entries(_strings)) {
    const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const l of LANGS) {
      assert.ok(entry[l], `${key} missing ${l}`);
      assert.equal(ph(entry[l]), ph(entry.en), `${key}: placeholders differ in ${l}`);
    }
  }
  assert.equal(t('xx', 'btnOrder'), '🛍 Order'); // unknown language falls back to English
});
