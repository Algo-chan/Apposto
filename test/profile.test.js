// Bot profile: the "What can this bot do?" description and the short profile text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyProfile, profileTexts } from '../src/bot/profile.js';

test('applyProfile sets the description and the short description', async () => {
  const calls = [];
  const api = {
    setMyDescription: async (text) => void calls.push(['description', text]),
    setMyShortDescription: async (text) => void calls.push(['short', text]),
  };
  await applyProfile(api, { brand: 'Apposto Delivery' });
  assert.deepEqual(calls.map((c) => c[0]), ['description', 'short']);
  const { description, shortDescription } = profileTexts('Apposto Delivery');
  assert.equal(calls[0][1], description);
  assert.equal(calls[1][1], shortDescription);
  assert.match(description, /Apposto Delivery/);
});

test('profile texts are trilingual and within Telegram limits', () => {
  for (const brand of ['Delivery', 'Apposto Delivery']) {
    const { description, shortDescription } = profileTexts(brand);
    assert.ok(description.length <= 512, `description is ${description.length} chars`);
    assert.ok(shortDescription.length <= 120, `short description is ${shortDescription.length} chars`);
    assert.match(description, /Shashamane/); // English
    assert.match(description, /Shashamannee/); // Afaan Oromoo
    assert.match(description, /ሻሸመኔ/); // Amharic
    assert.match(shortDescription, new RegExp(brand));
  }
});
