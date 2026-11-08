// Delivery time estimates (pure functions). Always shown as a range in minutes:
// Ethiopians often use the local 12-hour clock, so "35-45 min" is clearer than a clock time.

const round5 = (n) => Math.round(n / 5) * 5;

/** Full estimate before/at payment: prep + rider to shop + bike ride + buffer. */
export function estimateDelivery({ prepMin, distanceKm }, cfg) {
  const km = Number.isFinite(distanceKm) ? distanceKm : cfg.defaultDistanceKm;
  const total = prepMin + cfg.pickupMin + km * cfg.rideMinPerKm + cfg.etaBufferMin;
  const min = Math.max(15, round5(total - 5));
  return { min, max: min + 10 };
}

/** After pickup: only the bike ride is left. */
export function estimateRide(distanceKm, cfg) {
  const km = Number.isFinite(distanceKm) ? distanceKm : cfg.defaultDistanceKm;
  const min = Math.max(5, round5(km * cfg.rideMinPerKm + 2));
  return { min, max: min + 5 };
}

/** Minutes between two "YYYY-MM-DD HH:MM:SS" timestamps (same timezone). */
export function minutesBetween(a, b) {
  if (!a || !b) return null;
  const t = (s) => Date.parse(s.replace(' ', 'T') + 'Z');
  const d = (t(b) - t(a)) / 60000;
  return Number.isFinite(d) ? d : null;
}

/**
 * Learn a shop's real prep time from its recent orders (payment confirmed -> ready/picked up).
 * Uses the median of the last `sample` orders once there are at least `minSamples`.
 */
export function learnedPrepMinutes(orders, fallback, { sample = 20, minSamples = 5 } = {}) {
  const durations = orders
    .filter((o) => o.confirmedAt && (o.readyAt || o.pickedUpAt))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, sample)
    .map((o) => minutesBetween(o.confirmedAt, o.readyAt || o.pickedUpAt))
    .filter((m) => m != null && m >= 1 && m <= 120)
    .sort((a, b) => a - b);
  if (durations.length < minSamples) return fallback;
  const mid = Math.floor(durations.length / 2);
  const median = durations.length % 2 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2;
  return Math.round(median);
}

/** Average food rating; hidden (null) until there are enough reviews to be fair to new shops. */
export function ratingSummary(reviews, minCount = 5) {
  const stars = reviews.map((r) => r.foodStars).filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
  if (stars.length < minCount) return null;
  const avg = stars.reduce((s, n) => s + n, 0) / stars.length;
  return { avg: Math.round(avg * 10) / 10, count: stars.length };
}
