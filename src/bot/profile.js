// Bot profile: the "What can this bot do?" text in an empty chat and the short text on the
// bot's profile page. Both are trilingual (see botDescription in i18n.js), so the English entry is used.
// The profile photo is set by hand in @BotFather.
import { t } from '../i18n.js';

export function profileTexts(brand) {
  return {
    description: t('en', 'botDescription', { brand }),
    shortDescription: t('en', 'botShortDescription', { brand }),
  };
}

export async function applyProfile(api, { brand } = {}) {
  const { description, shortDescription } = profileTexts(brand);
  // grammY's Api takes the text itself (Telegram field: description / short_description)
  await api.setMyDescription(description);
  await api.setMyShortDescription(shortDescription);
}
