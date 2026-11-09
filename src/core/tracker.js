// Live order tracker (pure): the 6 stages a customer sees, and the caption timeline.
import { t } from '../i18n.js';
import { STATUS } from './orders.js';

export const STAGES = 6;
const LABEL_KEYS = ['stageSent', 'stageAccepted', 'stagePaid', 'stageRider', 'stageComing', 'stageDone'];

/** The 6 bar labels drawn under the picture card, in the customer's language. */
export function stageLabels(lang) {
  return LABEL_KEYS.map((k) => t(lang, k));
}

/** 1 sent · 2 accepted (pay) · 3 paid (preparing) · 4 rider · 5 on the way · 6 delivered; null = closed. */
export function trackerStage(order) {
  switch (order?.status) {
    case STATUS.PLACED:
      return 1;
    case STATUS.ACCEPTED:
    case STATUS.PAYMENT_SUBMITTED:
      return 2;
    case STATUS.CONFIRMED:
    case STATUS.READY:
      return order.riderId ? 4 : 3;
    case STATUS.PICKED_UP:
      return 5;
    case STATUS.DELIVERED:
      return 6;
    default:
      return null;
  }
}

/** Six lines: ✅ done, 🟢 now, ⚪ still to come. Delivered (stage 6) is all done. */
export function timeline(lang, stage) {
  const lines = [];
  for (let i = 1; i <= STAGES; i++) {
    const mark = i < stage || stage === STAGES ? '✅' : i === stage ? '🟢' : '⚪';
    lines.push(`${mark} ${t(lang, `timeline${i}`)}`);
  }
  return lines.join('\n');
}
