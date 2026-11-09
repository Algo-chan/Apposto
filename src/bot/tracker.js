// Live order tracker for customers: each update sends a short headline that stays in the chat,
// then one live picture card (stage bars + timeline caption) that replaces the previous card.
// Updates come from different chats at once (shop, rider, dispatch group, customer), so every
// change of one order's card runs under that order's tracker lock. A tracker failure is logged
// here and never thrown: it must not break the shop's or rider's action.
import { InlineKeyboard } from 'grammy';
import { t, normLang } from '../i18n.js';
import { withLock } from '../core/lock.js';
import { trackerStage, timeline, STAGES } from '../core/tracker.js';
import { estimateRide } from '../core/eta.js';
import { esc, th, HTML } from './html.js';
import { customerFees } from './ui.js';

export function createTracker({ api, store, notify, config, insights }) {
  const log = (what, id, err) => console.error(`tracker ${what} ${id}: ${err?.description || err?.message || err}`);
  const inFlight = new Set(); // tracker work not finished yet (callers may not await it)
  // orderId -> the last card id this process sent. Used besides order.trackerMsgId, so the old
  // card is still deleted when the store could not keep the id (a sheet without the
  // tracker_msg_id column, or a failed save).
  const lastCard = new Map();

  /** Run one change of an order's card under its lock; remembered until it is done. */
  function locked(order, fn) {
    const run = withLock(`tracker:${order.id}`, fn);
    inFlight.add(run);
    const done = () => inFlight.delete(run);
    run.then(done, done);
    return run;
  }

  /** Resolves when all tracker work started so far (and anything it queued) has finished. */
  async function idle() {
    while (inFlight.size) await Promise.allSettled([...inFlight]);
  }

  /** The latest saved order (the caller's copy may be older, e.g. without the card id). */
  async function reread(order) {
    try {
      return (await store.getOrder(order.id)) || order;
    } catch (err) {
      log('re-read', order.id, err);
      return order;
    }
  }

  /**
   * Stages 1-4: full estimate (prep + ride; at 4 the rider has not reached the shop yet);
   * 5 (picked up): the ride only; 6: none.
   */
  async function etaText(order, stage, lang) {
    try {
      let eta = null;
      if (stage <= 4) {
        const merchant = await store.getMerchant(order.merchantId);
        if (merchant) eta = await insights.eta(merchant, order.distanceKm);
      } else if (stage < STAGES) {
        eta = estimateRide(order.distanceKm, config);
      }
      return eta ? t(lang, 'etaRange', eta) : '';
    } catch (err) {
      log('eta', order.id, err);
      return '';
    }
  }

  function caption(order, stage, lang, eta) {
    const lines = [`<b>${esc(t(lang, `cardTitle${stage}`))}</b> · <code>${esc(order.id)}</code>`];
    if (stage >= 4 && order.riderName) lines.push(`<b>${esc(order.riderName)}</b> · 📞 ${esc(order.riderPhone)}`);
    lines.push('', esc(timeline(lang, stage)));
    const after = [];
    if (eta) after.push(`🕒 ${esc(eta)}`);
    // once delivered the rider has been paid: no "have cash ready" any more
    if (stage < STAGES) after.push(th(lang, 'cashReady', { cash: customerFees(order) }));
    if (after.length) lines.push('', ...after);
    return lines.join('\n');
  }

  function keyboard(order, stage, lang) {
    const kb = new InlineKeyboard();
    if (stage === 4 || stage === 5) kb.text(t(lang, 'btnCallRider'), `callrider:${order.id}`);
    return kb.text(t(lang, 'btnHelp'), 'menu:help');
  }

  /** headline: { text, other } or a string, already-built HTML; null = nothing to send. */
  async function sendHeadline(order, headline) {
    if (!headline) return;
    const { text, other = {} } = typeof headline === 'string' ? { text: headline } : headline;
    await notify.send(order.customerId, text, { ...other, ...HTML });
  }

  async function deleteCard(order) {
    const ids = new Set([order.trackerMsgId, lastCard.get(order.id)].filter(Boolean).map(String));
    for (const id of ids) {
      try {
        await api.deleteMessage(order.customerId, Number(id));
      } catch {
        /* already gone, or too old to delete (48 h): the new card still goes out */
      }
    }
  }

  async function saveCardId(order, id) {
    if (id) lastCard.set(order.id, id);
    else lastCard.delete(order.id);
    if ((order.trackerMsgId || '') === id) return;
    try {
      await store.updateOrder(order.id, { trackerMsgId: id });
    } catch (err) {
      log('save card id', order.id, err);
    }
  }

  /** Picture card; the same caption as an HTML text message when there is no picture. */
  async function sendCard(order, stage, lang) {
    const eta = await etaText(order, stage, lang);
    const text = caption(order, stage, lang, eta);
    const reply_markup = keyboard(order, stage, lang);
    const key = `track:${lang}:${stage}:${eta}`;
    const args = { kind: 'tracker', lang, stage, eta };
    const photo = await notify.sendPhotoCached(order.customerId, key, args, { caption: text, ...HTML, reply_markup });
    return photo || (await notify.send(order.customerId, text, { ...HTML, reply_markup }));
  }

  function update(order, { headline = null } = {}) {
    return locked(order, async () => {
      try {
        const cur = await reread(order);
        const lang = normLang(cur.customerLang);
        await sendHeadline(cur, headline);
        await deleteCard(cur);
        const stage = trackerStage(cur);
        const sent = stage == null ? null : await sendCard(cur, stage, lang);
        await saveCardId(cur, sent ? String(sent.message_id) : '');
      } catch (err) {
        log('update', order.id, err);
      }
    });
  }

  /** Rejected / cancelled: remove the card, send the headline, forget the card id. */
  function close(order, headline) {
    return locked(order, async () => {
      try {
        const cur = await reread(order);
        await deleteCard(cur);
        await sendHeadline(cur, headline);
        await saveCardId(cur, '');
      } catch (err) {
        log('close', order.id, err);
      }
    });
  }

  return { update, close, idle };
}
