// Live order tracker: which of the 6 stages an order is in, and the caption timeline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackerStage, timeline } from '../src/core/tracker.js';
import { LANGS } from '../src/i18n.js';

test('trackerStage maps every status (and the rider) to a stage', () => {
  const cases = [
    [{ status: 'PLACED' }, 1],
    [{ status: 'ACCEPTED' }, 2],
    [{ status: 'PAYMENT_SUBMITTED' }, 2],
    [{ status: 'CONFIRMED', riderId: '' }, 3],
    [{ status: 'CONFIRMED' }, 3],
    [{ status: 'READY', riderId: '' }, 3],
    [{ status: 'CONFIRMED', riderId: '300' }, 4],
    [{ status: 'READY', riderId: '300' }, 4],
    [{ status: 'PICKED_UP', riderId: '300' }, 5],
    [{ status: 'DELIVERED', riderId: '300' }, 6],
    [{ status: 'REJECTED' }, null],
    [{ status: 'CANCELLED', riderId: '300' }, null],
  ];
  for (const [order, stage] of cases) assert.equal(trackerStage(order), stage, JSON.stringify(order));
});

const marks = (s) => ({
  done: (s.match(/✅/g) || []).length,
  now: (s.match(/🟢/g) || []).length,
  todo: (s.match(/⚪/g) || []).length,
});

test('timeline: done, current and upcoming lines', () => {
  const tl = timeline('en', 4);
  assert.equal(tl.split('\n').length, 6);
  assert.deepEqual(marks(tl), { done: 3, now: 1, todo: 2 });
  assert.match(tl.split('\n')[3], /^🟢/);
  assert.deepEqual(marks(timeline('en', 1)), { done: 0, now: 1, todo: 5 });
});

test('timeline: delivered is all done, in every language', () => {
  for (const lang of LANGS) {
    assert.deepEqual(marks(timeline(lang, 6)), { done: 6, now: 0, todo: 0 }, lang);
    assert.equal(timeline(lang, 2).split('\n').length, 6, lang);
  }
});

test('the tracker card renders as a PNG with labels in the customer language', async () => {
  const { renderCard } = await import('../src/bot/createBot.js');
  const png = await renderCard({ kind: 'tracker', lang: 'om', stage: 4, eta: 'daqiiqaa 5–10' });
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});
