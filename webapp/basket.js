// The basket: items from one shop, plus an optional written request. Plain data, so it can be
// saved in sessionStorage and tested in Node. Every change returns a new basket.

const MAX_QTY = 20;
const fresh = () => ({ merchantId: null, items: {}, custom: '' });

/** A basket from saved data, or an empty one when the data is missing or broken. */
export function createBasket(saved) {
  if (!saved || typeof saved !== 'object' || typeof saved.items !== 'object' || saved.items === null) return fresh();
  if (saved.merchantId !== null && typeof saved.merchantId !== 'string') return fresh();
  const items = {};
  for (const [id, qty] of Object.entries(saved.items)) {
    if (Number.isInteger(qty) && qty > 0) items[id] = Math.min(qty, MAX_QTY);
  }
  return { merchantId: saved.merchantId, items, custom: typeof saved.custom === 'string' ? saved.custom : '' };
}

export function count(basket) {
  return Object.values(basket.items).reduce((n, q) => n + q, 0);
}

/** One more of an item. From another shop while this basket has items: { needsSwitch: true }. */
export function add(basket, merchantId, itemId) {
  if (basket.merchantId && basket.merchantId !== merchantId && (count(basket) > 0 || basket.custom)) {
    return { needsSwitch: true };
  }
  const base = basket.merchantId === merchantId ? basket : { ...fresh(), merchantId };
  const qty = Math.min((base.items[itemId] || 0) + 1, MAX_QTY);
  return { ...base, items: { ...base.items, [itemId]: qty } };
}

/** One less of an item; at zero it leaves the basket. */
export function remove(basket, itemId) {
  const qty = (basket.items[itemId] || 0) - 1;
  const items = { ...basket.items };
  if (qty > 0) items[itemId] = qty;
  else delete items[itemId];
  return { ...basket, items };
}

/** Food total for display (the server works out the real one). itemsById: Map(id -> { price }). */
export function foodTotal(basket, itemsById) {
  let total = 0;
  for (const [id, qty] of Object.entries(basket.items)) {
    const item = itemsById.get(id);
    if (item) total += item.price * qty;
  }
  return total;
}
