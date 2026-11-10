// Admins set menu item photos and shop banners by sending a picture to the bot with a caption:
// "I1" (item) or "banner M1" (shop). Telegram keeps the image; the sheet keeps its file_id.
// Replies are English (admin-only).
import { t } from '../i18n.js';

const ITEM_MAX_WIDTH = 800;
const BANNER_MAX_WIDTH = 1280;
const ID = /^[A-Z0-9_-]{1,20}$/i;

/** "I1" -> item, "banner M1" -> banner (any case and spacing); anything else -> null. */
export function parsePhotoCaption(caption) {
  const words = String(caption ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 2 && words[0].toLowerCase() === 'banner' && ID.test(words[1])) {
    return { kind: 'banner', id: words[1].toUpperCase() };
  }
  if (words.length === 1 && words[0].toLowerCase() !== 'banner' && ID.test(words[0])) {
    return { kind: 'item', id: words[0].toUpperCase() };
  }
  return null;
}

/** The file_id of the largest size at most maxWidth wide; the smallest one if all are wider. */
export function pickPhotoSize(sizes, maxWidth) {
  const byWidth = [...sizes].sort((a, b) => a.width - b.width);
  const fitting = byWidth.filter((s) => s.width <= maxWidth);
  return (fitting.at(-1) ?? byWidth[0]).file_id;
}

export function registerPhotos(bot, { store, config }) {
  const isAdmin = (userId) => config.adminIds.includes(String(userId));
  const pm = bot.chatType('private');

  pm.on('message:photo', async (ctx, next) => {
    if (!isAdmin(ctx.from.id)) return next();
    const target = parsePhotoCaption(ctx.message.caption);
    if (!target) return ctx.reply('❌ Please add a caption like I1 or banner M1');
    const sizes = ctx.message.photo;

    if (target.kind === 'banner') {
      const fileId = pickPhotoSize(sizes, BANNER_MAX_WIDTH);
      const shop = await store.setMerchantBanner(target.id, fileId);
      if (!shop) return ctx.reply(`❌ No shop ${target.id} in the Merchants tab`);
      return ctx.replyWithPhoto(fileId, { caption: `✅ Saved banner: ${shop.id} ${shop.names.en}` });
    }

    const fileId = pickPhotoSize(sizes, ITEM_MAX_WIDTH);
    const item = await store.setMenuPhoto(target.id, fileId);
    if (!item) return ctx.reply(`❌ No item ${target.id} in the Menu tab`);
    const shop = await store.getMerchant(item.merchantId);
    const where = shop ? ` (${shop.names.en})` : '';
    return ctx.replyWithPhoto(fileId, { caption: `✅ Saved: ${item.id} ${item.names.en}${where}` });
  });

  // A picture sent as a file is not shrunk by Telegram (and has no sizes to pick from).
  pm.on('message:document', async (ctx, next) => {
    if (!isAdmin(ctx.from.id) || !String(ctx.message.document.mime_type || '').startsWith('image/')) return next();
    return ctx.reply('❌ Send it as a photo, not a file');
  });

  bot.command('photos', async (ctx) => {
    if (!isAdmin(ctx.from?.id)) return ctx.reply(t('en', 'notAllowed'));
    const shops = (await store.getMerchants()).filter((m) => m.active);
    const noBanner = shops.filter((m) => !m.banner).map((m) => `${m.id} ${m.names.en}`);
    const noPhoto = [];
    for (const m of shops) {
      for (const i of await store.getMenu(m.id)) {
        if (i.active && !i.photo) noPhoto.push(`${i.id} ${i.names.en} (${m.id})`);
      }
    }
    if (noBanner.length === 0 && noPhoto.length === 0) return ctx.reply('✅ Every shop and item has a picture');
    const lines = [];
    if (noBanner.length) lines.push(`Shops without a banner: ${noBanner.join(', ')}`);
    if (noPhoto.length) lines.push(`Items without a photo: ${noPhoto.join(', ')}`);
    lines.push('', 'Send a photo with the caption I1 (item) or banner M1 (shop).');
    return ctx.reply(lines.join('\n'));
  });
}
