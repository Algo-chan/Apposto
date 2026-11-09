// Order operations with locking + state-machine checks. Telegram handlers call these.
import { withLock } from './lock.js';
import {
  STATUS,
  OrderError,
  assertTransition,
  calcCommission,
  calcRiderPay,
  RIDER_TAKEABLE,
  newOrderId,
  localTimestamp,
} from './orders.js';

// When each status was first reached: used to learn real prep times and measure speed.
const STATUS_TIME_FIELD = {
  ACCEPTED: 'acceptedAt',
  CONFIRMED: 'confirmedAt',
  READY: 'readyAt',
  PICKED_UP: 'pickedUpAt',
  DELIVERED: 'deliveredAt',
};

export function createOrderService({ store, config, now = () => new Date() }) {
  async function load(orderId) {
    const order = await store.getOrder(orderId);
    if (!order) throw new OrderError('NOT_FOUND', `Order ${orderId} not found`);
    return order;
  }

  async function placeOrder({ customer, merchant, summary, checkout }) {
    let id = newOrderId(now());
    // extremely unlikely collision, but check anyway
    // Memory only: a new id almost always misses, and a miss must not re-read the whole sheet.
    for (let i = 0; i < 3 && (await store.getOrder(id, { refresh: false })); i++) id = newOrderId(now());

    const ts = localTimestamp(now());
    const commissionPct = Number.isFinite(merchant.commissionPct)
      ? merchant.commissionPct
      : config.defaultCommissionPct;
    const itemsText = summary.lines.map((l) => `${l.qty} x ${l.nameEn} (${l.price})`).join('; ');
    const order = {
      id,
      createdAt: ts,
      updatedAt: ts,
      status: STATUS.PLACED,
      customerId: String(customer.id),
      customerName: customer.name,
      customerPhone: checkout.phone,
      customerLang: customer.lang,
      lat: checkout.lat,
      lng: checkout.lng,
      landmark: checkout.landmark,
      distanceKm: checkout.distanceKm,
      merchantId: merchant.id,
      merchantName: merchant.names.en,
      itemsText,
      itemsJson: JSON.stringify(summary.lines.map(({ itemId, qty, price }) => ({ itemId, qty, price }))),
      customRequest: summary.custom || '',
      // If there's a custom request the merchant sets the final food total when accepting.
      foodTotal: summary.custom ? null : summary.total,
      deliveryFee: checkout.deliveryFee,
      serviceFee: config.serviceFee,
      commissionPct,
      commission: null,
      paymentRef: '',
      riderId: '',
      riderName: '',
      riderPhone: '',
      riderPay: null,
      deliveredAt: '',
    };
    await store.createOrder(order);
    return order;
  }

  /**
   * Move an order to a new status.
   * guard(order) may throw OrderError('FORBIDDEN') to block the caller.
   * patch may be an object or a function(order) -> object.
   */
  function transition(orderId, to, patch = {}, guard) {
    return withLock(orderId, async () => {
      const order = await load(orderId);
      if (guard) guard(order);
      assertTransition(order.status, to);
      const extra = typeof patch === 'function' ? patch(order) : patch;
      const ts = localTimestamp(now());
      const tsField = STATUS_TIME_FIELD[to];
      return store.updateOrder(orderId, {
        ...(tsField && !order[tsField] ? { [tsField]: ts } : {}),
        ...extra,
        status: to,
        updatedAt: ts,
      });
    });
  }

  /** merchantId = the merchant record the caller was resolved to (from their Telegram id). */
  function accept(orderId, merchantId, finalFoodTotal) {
    return transition(
      orderId,
      STATUS.ACCEPTED,
      (order) => {
        const foodTotal = finalFoodTotal ?? order.foodTotal;
        if (!Number.isFinite(foodTotal)) throw new OrderError('INVALID', 'Food total required');
        return { foodTotal, commission: calcCommission(foodTotal, order.commissionPct) };
      },
      merchantGuard(merchantId)
    );
  }

  /** Locked per reference (then per order, as everywhere), so two chats can't both use one ref. */
  function submitPayment(orderId, customerId, ref) {
    return withLock(`payref:${ref}`, async () => {
      const dup = await store.findOrderByPaymentRef(ref);
      if (dup && dup.id !== orderId) throw new OrderError('DUPLICATE_REF', 'Reference already used');
      return transition(orderId, STATUS.PAYMENT_SUBMITTED, { paymentRef: ref }, customerGuard(customerId));
    });
  }

  function assignRider(orderId, rider) {
    return withLock(orderId, async () => {
      const order = await load(orderId);
      if (order.riderId) throw new OrderError('TAKEN', 'Already taken');
      if (!RIDER_TAKEABLE.has(order.status)) {
        throw new OrderError('BAD_TRANSITION', `Order is ${order.status}`);
      }
      return store.updateOrder(orderId, {
        riderId: String(rider.telegramId),
        riderName: rider.name,
        riderPhone: rider.phone,
        riderPay: calcRiderPay(order.deliveryFee, config.riderSharePct),
        updatedAt: localTimestamp(now()),
      });
    });
  }

  function unassignRider(orderId, riderTelegramId) {
    return withLock(orderId, async () => {
      const order = await load(orderId);
      if (order.riderId !== String(riderTelegramId)) return order;
      return store.updateOrder(orderId, {
        riderId: '',
        riderName: '',
        riderPhone: '',
        riderPay: null,
        updatedAt: localTimestamp(now()),
      });
    });
  }

  return {
    load,
    placeOrder,
    transition,
    accept,
    submitPayment,
    assignRider,
    unassignRider,
  };
}

// ---- guards: who is allowed to touch an order ----
// Handlers first resolve the caller (Telegram id -> merchant/rider record), then pass the id here.
export function merchantGuard(merchantId) {
  return (order) => {
    if (!merchantId || order.merchantId !== String(merchantId)) {
      throw new OrderError('FORBIDDEN', 'Not your shop');
    }
  };
}

export function customerGuard(customerId) {
  return (order) => {
    if (order.customerId !== String(customerId)) throw new OrderError('FORBIDDEN', 'Not your order');
  };
}

export function riderGuard(riderTelegramId) {
  return (order) => {
    if (order.riderId !== String(riderTelegramId)) throw new OrderError('FORBIDDEN', 'Not your delivery');
  };
}
