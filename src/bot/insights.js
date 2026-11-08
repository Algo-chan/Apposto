// Cached per-shop numbers: learned prep time (-> ETA) and average rating.
import { estimateDelivery, learnedPrepMinutes, ratingSummary } from '../core/eta.js';
import { STATUS } from '../core/orders.js';

export function createInsights({ store, config }) {
  const cache = new Map();

  async function cached(key, ttlMs, loader) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = await loader();
    cache.set(key, { at: Date.now(), value });
    return value;
  }

  /** Shop's prep time: learned from its last orders, else the sheet's prep_min, else the default. */
  function prepMinutes(merchant) {
    return cached(`prep:${merchant.id}`, 10 * 60 * 1000, async () => {
      const fallback = Number.isFinite(merchant.prepMin) ? merchant.prepMin : config.defaultPrepMin;
      const orders = (await store.listOrders({ statuses: [STATUS.DELIVERED] })).filter(
        (o) => o.merchantId === merchant.id
      );
      return learnedPrepMinutes(orders, fallback);
    });
  }

  async function eta(merchant, distanceKm) {
    return estimateDelivery({ prepMin: await prepMinutes(merchant), distanceKm }, config);
  }

  function rating(merchantId) {
    return cached(`rating:${merchantId}`, 60 * 1000, async () =>
      ratingSummary(await store.listReviews({ merchantId }), config.minReviewsToShow)
    );
  }

  return {
    eta,
    prepMinutes,
    rating,
    invalidateRating: (merchantId) => cache.delete(`rating:${merchantId}`),
  };
}
