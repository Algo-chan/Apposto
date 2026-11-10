// Google Sheets layout: tab name -> columns. [sheet header, field name, type]
// Types: str | num | bool | id (Telegram id kept as text)

export const TABS = {
  Merchants: [
    ['merchant_id', 'id', 'str'],
    ['name_en', 'nameEn', 'str'],
    ['name_om', 'nameOm', 'str'],
    ['name_am', 'nameAm', 'str'],
    ['telegram_id', 'telegramId', 'id'],
    ['phone', 'phone', 'str'],
    ['lang', 'lang', 'str'],
    ['telebirr', 'telebirr', 'str'],
    ['cbe_account', 'cbeAccount', 'str'],
    ['account_name', 'accountName', 'str'],
    ['commission_pct', 'commissionPct', 'num'],
    ['lat', 'lat', 'num'],
    ['lng', 'lng', 'num'],
    ['active', 'active', 'bool'],
    ['prep_min', 'prepMin', 'num'],
    ['banner', 'banner', 'str'], // Telegram file_id of the shop's banner (sent to the bot by an admin)
  ],
  Menu: [
    ['item_id', 'id', 'str'],
    ['merchant_id', 'merchantId', 'str'],
    ['name_en', 'nameEn', 'str'],
    ['name_om', 'nameOm', 'str'],
    ['name_am', 'nameAm', 'str'],
    ['price', 'price', 'num'],
    ['active', 'active', 'bool'],
    ['photo', 'photo', 'str'], // Telegram file_id of the item's photo (sent to the bot by an admin)
  ],
  Riders: [
    ['telegram_id', 'telegramId', 'id'],
    ['name', 'name', 'str'],
    ['phone', 'phone', 'str'],
    ['lang', 'lang', 'str'],
    ['active', 'active', 'bool'],
  ],
  Customers: [
    ['telegram_id', 'id', 'id'],
    ['name', 'name', 'str'],
    ['phone', 'phone', 'str'],
    ['lang', 'lang', 'str'],
    ['created_at', 'createdAt', 'str'],
  ],
  Orders: [
    ['order_id', 'id', 'str'],
    ['created_at', 'createdAt', 'str'],
    ['updated_at', 'updatedAt', 'str'],
    ['status', 'status', 'str'],
    ['merchant_id', 'merchantId', 'str'],
    ['merchant_name', 'merchantName', 'str'],
    ['items', 'itemsText', 'str'],
    ['custom_request', 'customRequest', 'str'],
    ['food_total', 'foodTotal', 'num'],
    ['delivery_fee', 'deliveryFee', 'num'],
    ['service_fee', 'serviceFee', 'num'],
    ['commission_pct', 'commissionPct', 'num'],
    ['commission', 'commission', 'num'],
    ['payment_ref', 'paymentRef', 'str'],
    ['customer_tg_id', 'customerId', 'id'],
    ['customer_name', 'customerName', 'str'],
    ['customer_phone', 'customerPhone', 'str'],
    ['customer_lang', 'customerLang', 'str'],
    ['landmark', 'landmark', 'str'],
    ['lat', 'lat', 'num'],
    ['lng', 'lng', 'num'],
    ['distance_km', 'distanceKm', 'num'],
    ['rider_tg_id', 'riderId', 'id'],
    ['rider_name', 'riderName', 'str'],
    ['rider_phone', 'riderPhone', 'str'],
    ['rider_pay', 'riderPay', 'num'],
    ['delivered_at', 'deliveredAt', 'str'],
    ['items_json', 'itemsJson', 'str'],
    ['accepted_at', 'acceptedAt', 'str'],
    ['confirmed_at', 'confirmedAt', 'str'],
    ['ready_at', 'readyAt', 'str'],
    ['picked_up_at', 'pickedUpAt', 'str'],
    ['eta_min', 'etaMin', 'num'],
    ['eta_max', 'etaMax', 'num'],
    ['tracker_msg_id', 'trackerMsgId', 'str'], // the customer's live tracker card (Telegram message id)
  ],
  Reviews: [
    ['order_id', 'orderId', 'str'],
    ['created_at', 'createdAt', 'str'],
    ['merchant_id', 'merchantId', 'str'],
    ['merchant_name', 'merchantName', 'str'],
    ['food_stars', 'foodStars', 'num'],
    ['rider_thumb', 'riderThumb', 'str'],
    ['comment', 'comment', 'str'],
    ['rider_tg_id', 'riderId', 'id'],
    ['rider_name', 'riderName', 'str'],
    ['customer_tg_id', 'customerId', 'id'],
  ],
};

export function headers(tab) {
  return TABS[tab].map(([h]) => h);
}

function parseValue(raw, type) {
  const s = raw == null ? '' : String(raw).trim();
  switch (type) {
    case 'num': {
      if (s === '') return null;
      const n = Number(s.replace(/,/g, ''));
      return Number.isFinite(n) ? n : null;
    }
    case 'bool':
      return ['TRUE', 'YES', '1', 'Y'].includes(s.toUpperCase());
    default:
      return s;
  }
}

/** Sheet row (header -> raw) to a typed JS object. */
export function fromRow(tab, getter) {
  const obj = {};
  for (const [header, field, type] of TABS[tab]) obj[field] = parseValue(getter(header), type);
  return obj;
}

/**
 * JS object (possibly partial) to sheet values. Numbers stay numbers so you can SUM in Sheets;
 * text stays text (written in RAW mode) so phone numbers keep their leading 0.
 */
export function toRow(tab, obj) {
  const out = {};
  for (const [header, field, type] of TABS[tab]) {
    if (!(field in obj)) continue;
    const v = obj[field];
    if (v == null) out[header] = '';
    else if (type === 'num') out[header] = Number.isFinite(v) ? v : '';
    else if (type === 'bool') out[header] = v ? 'TRUE' : 'FALSE';
    else out[header] = sanitizeForSheet(String(v));
  }
  return out;
}

/**
 * Formula-injection guard: values written in RAW mode are never executed, but if someone later
 * copies them into another sheet/Excel, a leading = + - @ could run. Prefix with an apostrophe.
 */
function sanitizeForSheet(s) {
  return /^[=+\-@]/.test(s) ? `'${s}` : s;
}

/** Merchant/menu records get a names object for i18n. */
export function withNames(rec) {
  return {
    ...rec,
    names: { en: rec.nameEn, om: rec.nameOm || rec.nameEn, am: rec.nameAm || rec.nameEn },
  };
}
