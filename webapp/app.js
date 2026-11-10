// The customer mini app: shops -> menu -> basket & details -> confirm -> order status.
// The server checks everything again (prices, fees, who you are); this page only shows it.
import { createBasket, add, remove, count, foodTotal } from '/app/basket.js';
import { createApi } from '/app/net.js';
import { tr } from '/app/strings.js';

const tg = window.Telegram?.WebApp;
const inTelegram = Boolean(tg?.initData);
// Telegram's own Back button and vibration exist from app version 6.1; older apps get the page's Back link.
const nativeBack = inTelegram && Boolean(tg.isVersionAtLeast?.('6.1'));
const haptic = nativeBack ? tg.HapticFeedback : null;
const initData = tg?.initData || window.__DEV_INIT_DATA__ || '';
const root = document.getElementById('app');
const SAVE_KEY = 'shop.v1';
const POLL_MS = 5000;
const FINAL = new Set(['DELIVERED', 'REJECTED', 'CANCELLED']);
const STAGES = ['PLACED', 'ACCEPTED', 'PAYMENT_SUBMITTED', 'CONFIRMED', 'READY', 'PICKED_UP', 'DELIVERED'];

const state = {
  lang: 'en',
  me: null,
  shops: [],
  shop: null, // { id, names, banner }
  items: [], // current shop's menu
  basket: createBasket(),
  form: { landmark: '', phone: '', lat: null, lng: null, loc: 'none' }, // loc: none | busy | set | skipped | failed
  quote: null,
  requestId: null,
  orderId: null,
  order: null,
  stack: [], // screens to go back to
  screen: null,
  error: '',
  busy: false,
};

const api = createApi({ initData, onRetry: () => showConnecting() });
const T = (key, params) => tr(state.lang, key, params);
const money = (n) => `${Math.round(n || 0).toLocaleString('en-US')} Br`;
const nameOf = (rec) => rec?.names?.[state.lang] || rec?.names?.en || '';

// ---------- tiny DOM helper (text is always set as text, never as HTML) ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 1800);
}

// ---------- saving the basket and form (this tab only) ----------
function save() {
  try {
    sessionStorage.setItem(SAVE_KEY, JSON.stringify({ basket: state.basket, form: { ...state.form, loc: state.form.loc === 'busy' ? 'none' : state.form.loc } }));
  } catch {
    /* storage off: the page still works */
  }
}
function restore() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SAVE_KEY) || 'null');
    if (!saved) return;
    state.basket = createBasket(saved.basket);
    if (saved.form && typeof saved.form === 'object') state.form = { ...state.form, ...saved.form };
  } catch {
    /* broken or blocked: start fresh */
  }
}

// ---------- navigation ----------
function go(screen, { replace = false } = {}) {
  if (state.screen && !replace) state.stack.push(state.screen);
  state.screen = screen;
  state.error = '';
  render();
  window.scrollTo(0, 0);
}
function back() {
  const prev = state.stack.pop();
  if (!prev) return;
  state.screen = prev;
  state.error = '';
  render();
}
function home() {
  state.stack = [];
  state.screen = null;
  loadShops();
}
if (nativeBack) tg.BackButton.onClick(back);

function frame(title, ...content) {
  const kids = [];
  if (state.stack.length && !nativeBack) kids.push(h('button', { class: 'back', onclick: back }, '‹ Back'));
  if (title) kids.push(h('h1', {}, title));
  if (state.error) kids.push(h('p', { class: 'error', role: 'alert' }, state.error));
  return [...kids, ...content];
}
function bar(label, onclick, { disabled = false } = {}) {
  return h('div', { class: 'bar' }, h('button', { onclick, disabled: disabled || state.busy }, state.busy ? T('sending') : label));
}

function render() {
  if (nativeBack) {
    if (state.stack.length) tg.BackButton.show();
    else tg.BackButton.hide();
  }
  const view = SCREENS[state.screen]?.() ?? [];
  root.replaceChildren(...view.filter(Boolean));
}

function showConnecting() {
  root.replaceChildren(h('div', { class: 'center' }, h('div', { class: 'spinner' }), h('p', {}, T('connecting'))));
}
function showFatal(code, retry) {
  const kids = [h('p', {}, T(`err_${code}`))];
  if (retry) kids.push(h('button', { class: 'btn-secondary', onclick: retry }, T('retry')));
  root.replaceChildren(h('div', { class: 'center' }, ...kids));
}
/** An API answer that failed: the message for it (and the 401 screen). */
function failed(res) {
  const code = res.body?.error || (res.status === 0 ? 'NETWORK' : 'ERROR');
  if (code === 'UNAUTHORIZED') showFatal('UNAUTHORIZED');
  return code;
}

// ---------- start ----------
async function start() {
  tg?.ready();
  tg?.expand();
  if (inTelegram) document.documentElement.classList.add('tg');
  restore();
  showConnecting();
  const me = await api('/api/me');
  if (!me.ok) {
    const code = failed(me);
    if (code !== 'UNAUTHORIZED') showFatal(code, start);
    return;
  }
  state.me = me.body;
  if (me.body.phone && !state.form.phone) state.form.phone = me.body.phone;
  if (!me.body.lang) {
    state.screen = 'lang';
    return render();
  }
  state.lang = me.body.lang;
  document.documentElement.lang = state.lang;
  return loadShops();
}

async function chooseLang(lang) {
  state.lang = lang;
  document.documentElement.lang = lang;
  await api('/api/lang', { method: 'POST', body: { lang } }); // a failure only means we ask again next time
  loadShops();
}

async function loadShops() {
  showConnecting();
  const res = await api('/api/shops');
  if (!res.ok) {
    const code = failed(res);
    if (code !== 'UNAUTHORIZED') showFatal(code, loadShops);
    return;
  }
  state.shops = res.body.shops;
  state.order = null;
  if (state.me?.openOrderId) {
    const o = await api(`/api/orders/${encodeURIComponent(state.me.openOrderId)}`);
    if (o.ok && !FINAL.has(o.body.status)) state.order = o.body;
  }
  state.stack = [];
  state.screen = 'shops';
  render();
}

async function openShop(shop) {
  showConnecting();
  const res = await api(`/api/shops/${encodeURIComponent(shop.id)}/menu`);
  if (!res.ok) {
    const code = failed(res);
    if (code === 'UNAUTHORIZED') return;
    state.error = T(`err_${code}`);
    return render();
  }
  state.shop = res.body.shop;
  state.items = res.body.items;
  pruneBasket();
  go('menu');
}

/** Drop basket items that are no longer on the menu (after a reload). */
function pruneBasket() {
  if (state.basket.merchantId !== state.shop?.id) return;
  const ids = new Set(state.items.map((i) => i.id));
  const items = Object.fromEntries(Object.entries(state.basket.items).filter(([id]) => ids.has(id)));
  state.basket = { ...state.basket, items };
  save();
}

// ---------- screens ----------
const SCREENS = {
  lang: () => [
    h('h1', {}, '🌍'),
    ...[['om', 'Afaan Oromoo'], ['am', 'አማርኛ'], ['en', 'English']].map(([l, label]) =>
      h('button', { class: 'lang', onclick: () => chooseLang(l) }, label)
    ),
    h('p', { class: 'hint center' }, `${tr('om', 'chooseLang')} · ${tr('am', 'chooseLang')} · ${tr('en', 'chooseLang')}`),
  ],

  shops: () => {
    const kids = [];
    if (state.order) {
      kids.push(
        h('button', { class: 'strip', onclick: () => openStatus(state.order.id) }, `${T('openOrder', { id: state.order.id, status: T(`st_${state.order.status}`) })} ›`)
      );
    }
    if (state.shops.length === 0) kids.push(h('p', { class: 'center hint' }, T('noShops')));
    for (const s of state.shops) {
      kids.push(
        h(
          'button',
          { class: 'shop', onclick: () => openShop(s) },
          bannerEl(s),
          h('div', { class: 'row' }, h('span', { class: 'name' }, nameOf(s)), Number.isFinite(s.prepMin) ? h('span', { class: 'hint' }, T('prepTime', { min: s.prepMin })) : null)
        )
      );
    }
    const n = count(state.basket);
    const basketBar = n && state.basket.merchantId && state.shops.some((s) => s.id === state.basket.merchantId)
      ? bar(viewBasketLabel(), () => openShop(state.shops.find((s) => s.id === state.basket.merchantId)))
      : null;
    return [...frame(T('shopsTitle'), ...kids), basketBar];
  },

  menu: () => {
    const kids = [h('div', { class: 'hero' }, bannerEl(state.shop))];
    if (state.items.length === 0) kids.push(h('p', { class: 'center hint' }, T('menuEmpty')));
    kids.push(h('div', { class: 'grid' }, state.items.map(itemCard)));
    const inThisShop = state.basket.merchantId === state.shop.id;
    const show = inThisShop && (count(state.basket) > 0 || state.basket.custom);
    return [...frame(nameOf(state.shop), ...kids), show ? bar(viewBasketLabel(), openBasket) : null];
  },

  basket: () => basketScreen(),
  confirm: () => confirmScreen(),
  status: () => statusScreen(),
};

function bannerEl(shop) {
  if (shop?.banner) {
    const img = h('img', { class: 'banner', src: shop.banner, alt: '', loading: 'lazy' });
    img.addEventListener('error', () => img.replaceWith(h('div', { class: 'banner-fallback' }, nameOf(shop))));
    return img;
  }
  return h('div', { class: 'banner-fallback' }, nameOf(shop));
}

function photoEl(item) {
  const fallback = () => h('div', { class: 'photo-fallback', 'aria-hidden': 'true' }, (nameOf(item)[0] || '•').toUpperCase());
  if (!item.photo) return fallback();
  const img = h('img', { class: 'photo', src: item.photo, alt: '', loading: 'lazy' });
  img.addEventListener('error', () => img.replaceWith(fallback()));
  return img;
}

function stepper(itemId, qty) {
  return h(
    'div',
    { class: 'stepper' },
    h('button', { 'aria-label': '−', onclick: () => change(itemId, -1) }, '−'),
    h('span', {}, qty),
    h('button', { 'aria-label': '+', onclick: () => change(itemId, +1) }, '+')
  );
}

function itemCard(item) {
  const qty = state.basket.merchantId === state.shop.id ? state.basket.items[item.id] || 0 : 0;
  return h(
    'div',
    { class: 'item' },
    photoEl(item),
    h(
      'div',
      { class: 'body' },
      h('div', { class: 'name' }, nameOf(item)),
      h('div', { class: 'price' }, money(item.price)),
      h('div', { class: 'controls' }, qty ? stepper(item.id, qty) : h('button', { class: 'btn-add', onclick: () => change(item.id, +1) }, `+ ${T('add')}`))
    )
  );
}

function change(itemId, delta) {
  if (delta > 0) {
    const next = add(state.basket, state.shop.id, itemId);
    if (next.needsSwitch) {
      const ok = () => {
        state.basket = add(createBasket(), state.shop.id, itemId);
        state.quote = null;
        save();
        render();
      };
      if (tg?.showPopup && inTelegram) {
        tg.showPopup({ message: T('switchShop'), buttons: [{ id: 'yes', type: 'destructive', text: T('switchYes') }, { id: 'no', type: 'cancel' }] }, (id) => id === 'yes' && ok());
      } else if (window.confirm(T('switchShop'))) ok();
      return;
    }
    state.basket = next;
    haptic?.selectionChanged();
  } else {
    state.basket = remove(state.basket, itemId);
  }
  save();
  render();
}

function itemsById() {
  return new Map(state.items.map((i) => [i.id, i]));
}
function viewBasketLabel() {
  const food = foodTotal(state.basket, itemsById());
  return T('viewBasket', { n: count(state.basket), total: money(food) });
}

// ---------- basket & details ----------
/** The basket screen; a location chosen earlier (saved in this tab) gets its fee again. */
function openBasket() {
  go('basket');
  if (!state.quote && (state.form.loc === 'set' || state.form.loc === 'skipped')) requestQuote();
}
async function requestQuote() {
  const body = { merchantId: state.shop.id };
  if (state.form.loc === 'set') Object.assign(body, { lat: state.form.lat, lng: state.form.lng });
  const res = await api('/api/quote', { method: 'POST', body });
  state.quote = res.ok ? res.body : null;
  if (!res.ok) {
    const code = failed(res);
    if (code === 'UNAUTHORIZED') return;
    state.error = T(`err_${code}`);
  }
  render();
}

function browserLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}
function telegramLocation() {
  const lm = tg?.LocationManager;
  if (!lm || !tg.isVersionAtLeast?.('8.0')) return browserLocation();
  return new Promise((resolve) => {
    const ask = () => {
      if (!lm.isLocationAvailable) return resolve(browserLocation());
      lm.getLocation((loc) => resolve(loc ? { lat: loc.latitude, lng: loc.longitude } : null));
    };
    if (lm.isInited) ask();
    else lm.init(ask);
  });
}

async function useLocation() {
  state.form.loc = 'busy';
  render();
  const point = await telegramLocation();
  if (point) Object.assign(state.form, { lat: point.lat, lng: point.lng, loc: 'set' });
  else Object.assign(state.form, { lat: null, lng: null, loc: 'failed' });
  save();
  await requestQuote();
}
async function skipLocation() {
  Object.assign(state.form, { lat: null, lng: null, loc: 'skipped' });
  save();
  await requestQuote();
}

function sharePhone() {
  if (!tg?.requestContact || !tg.isVersionAtLeast?.('6.9')) return;
  tg.requestContact((shared, res) => {
    const phone = res?.responseUnsafe?.contact?.phone_number;
    if (shared && phone) {
      state.form.phone = phone.startsWith('+') ? phone : `+${phone}`;
      save();
      render();
    }
  });
}

function field(labelText, input) {
  return [h('label', { for: input.id }, labelText), input];
}

function basketScreen() {
  const byId = itemsById();
  const lines = Object.entries(state.basket.items).map(([id, qty]) => {
    const item = byId.get(id);
    return h('div', { class: 'line' }, h('span', {}, `${nameOf(item)} · ${money(item.price * qty)}`), stepper(id, qty));
  });

  const custom = h('textarea', { id: 'custom', maxlength: 300, placeholder: T('specialRequestHint') });
  custom.value = state.basket.custom;
  custom.addEventListener('input', () => {
    state.basket = { ...state.basket, custom: custom.value };
    save();
  });

  const f = state.form;
  const locLine = {
    none: null,
    busy: h('p', { class: 'hint' }, T('locating')),
    set: h('p', { class: 'ok' }, Number.isFinite(state.quote?.distanceKm) ? T('locationSet', { km: state.quote.distanceKm }) : T('locationSetPlain')),
    skipped: h('p', { class: 'hint' }, T('locationSkipped')),
    failed: h('p', { class: 'error' }, T('locationFailed')),
  }[f.loc];

  const landmark = h('input', { id: 'landmark', maxlength: 200, placeholder: T('landmarkHint'), autocomplete: 'off' });
  landmark.value = f.landmark;
  landmark.addEventListener('input', () => {
    f.landmark = landmark.value;
    save();
    updateContinue();
  });
  const phone = h('input', { id: 'phone', type: 'tel', inputmode: 'tel', placeholder: T('phoneHint'), autocomplete: 'tel' });
  phone.value = f.phone;
  phone.addEventListener('input', () => {
    f.phone = phone.value;
    save();
    updateContinue();
  });
  const canShare = Boolean(tg?.requestContact && tg.isVersionAtLeast?.('6.9') && inTelegram);

  const q = state.quote;
  const food = foodTotal(state.basket, byId);
  const hasItems = count(state.basket) > 0;
  const fees = q
    ? h(
        'div',
        { class: 'panel' },
        h('div', { class: 'line' }, h('span', {}, T('food')), h('span', {}, hasItems ? money(food) : T('priceByShop'), hasItems && state.basket.custom ? ` ${T('plusRequest')}` : '')),
        h('div', { class: 'line' }, h('span', {}, T('deliveryFee')), h('span', {}, money(q.deliveryFee))),
        h('div', { class: 'line' }, h('span', {}, T('serviceFee')), h('span', {}, money(q.serviceFee))),
        q.outOfRange ? h('p', { class: 'error' }, T('err_OUT_OF_RANGE')) : null
      )
    : null;

  const view = frame(
    T('basketTitle'),
    h('div', { class: 'panel' }, lines.length ? lines : h('p', { class: 'hint' }, T('err_EMPTY')), field(T('specialRequest'), custom)),
    h('h2', {}, T('locationTitle')),
    h(
      'div',
      { class: 'panel' },
      h('div', { class: 'btn-row' }, h('button', { class: 'btn-secondary', onclick: useLocation, disabled: f.loc === 'busy' }, T('useLocation')), h('button', { class: 'btn-secondary', onclick: skipLocation }, T('skipLocation'))),
      locLine,
      field(T('landmark'), landmark),
      field(T('phone'), phone),
      canShare ? h('button', { class: 'btn-secondary', onclick: sharePhone }, T('sharePhone')) : null
    ),
    fees
  );
  const b = bar(T('continue'), () => {
    if (!detailsReady()) return;
    if (!state.requestId) state.requestId = newRequestId();
    go('confirm');
  }, { disabled: !detailsReady() });
  b.id = 'continue-bar';
  return [...view, b];
}

function detailsReady() {
  const f = state.form;
  const located = f.loc === 'set' || f.loc === 'skipped';
  const hasSomething = count(state.basket) > 0 || state.basket.custom.trim();
  return Boolean(located && state.quote && !state.quote.outOfRange && hasSomething && f.landmark.trim().length >= 3 && f.phone.replace(/\D/g, '').length >= 9);
}
function updateContinue() {
  const btn = document.querySelector('#continue-bar button');
  if (btn) btn.disabled = !detailsReady() || state.busy;
}

function newRequestId() {
  return crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// ---------- confirm ----------
function confirmScreen() {
  const byId = itemsById();
  const q = state.quote;
  const food = foodTotal(state.basket, byId);
  const hasItems = count(state.basket) > 0;
  const lines = Object.entries(state.basket.items).map(([id, qty]) =>
    h('div', { class: 'line' }, h('span', {}, `${qty} × ${nameOf(byId.get(id))}`), h('span', {}, money(byId.get(id).price * qty)))
  );
  if (state.basket.custom.trim()) lines.push(h('div', { class: 'line' }, h('span', {}, `✍️ “${state.basket.custom.trim()}”`)));
  return [
    ...frame(
      T('confirmTitle'),
      h('div', { class: 'panel' }, h('div', { class: 'line' }, h('b', {}, nameOf(state.shop))), lines),
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'line' }, h('span', {}, T('food')), h('span', { class: 'total' }, hasItems ? money(food) : T('priceByShop'), hasItems && state.basket.custom.trim() ? ` ${T('plusRequest')}` : '')),
        h('p', { class: 'hint' }, T('payShopNote')),
        h('div', { class: 'line' }, h('span', {}, `${T('deliveryFee')} + ${T('serviceFee')}`), h('span', { class: 'total' }, money(q.deliveryFee + q.serviceFee))),
        h('p', { class: 'hint' }, T('cashRiderNote', { amount: money(q.deliveryFee + q.serviceFee) }))
      ),
      h('div', { class: 'panel' }, h('p', {}, `📍 ${state.form.landmark.trim()}`), h('p', {}, `📞 ${state.form.phone.trim()}`), q.eta ? h('p', { class: 'hint' }, T('eta', q.eta)) : null)
    ),
    bar(T('confirmOrder'), placeOrder),
  ];
}

async function placeOrder() {
  if (state.busy) return;
  state.busy = true;
  render();
  const f = state.form;
  const body = {
    requestId: state.requestId,
    merchantId: state.shop.id,
    items: state.basket.items,
    custom: state.basket.custom.trim(),
    landmark: f.landmark.trim(),
    phone: f.phone.trim(),
    ...(f.loc === 'set' ? { lat: f.lat, lng: f.lng } : {}),
  };
  const res = await api('/api/orders', { method: 'POST', body });
  state.busy = false;
  if (!res.ok) {
    const code = failed(res);
    if (code === 'UNAUTHORIZED') return;
    if (code === 'ITEM_GONE' || code === 'SHOP_CLOSED') {
      await reloadMenu();
      state.stack = ['shops', 'menu'];
      state.screen = code === 'SHOP_CLOSED' ? 'shops' : 'basket';
    } else if (['BAD_PHONE', 'BAD_LANDMARK', 'EMPTY', 'OUT_OF_RANGE'].includes(code)) {
      state.stack = ['shops', 'menu'];
      state.screen = 'basket';
    }
    state.requestId = null; // the next try is a new order
    state.error = T(`err_${code}`);
    haptic?.notificationOccurred('error');
    return render();
  }
  haptic?.notificationOccurred('success');
  state.basket = createBasket();
  state.quote = null;
  state.requestId = null;
  Object.assign(state.form, { lat: null, lng: null, loc: 'none' }); // landmark and phone are kept for next time
  save();
  if (state.me) state.me.openOrderId = res.body.orderId;
  openStatus(res.body.orderId, { fresh: true });
}

async function reloadMenu() {
  const res = await api(`/api/shops/${encodeURIComponent(state.shop.id)}/menu`);
  if (res.ok) {
    state.items = res.body.items;
    pruneBasket();
  }
}

// ---------- order status ----------
let pollTimer = null;
function stopPolling() {
  clearTimeout(pollTimer);
  pollTimer = null;
}
async function poll() {
  stopPolling();
  if (state.screen !== 'status' || !state.orderId) return;
  if (document.visibilityState === 'visible') {
    const res = await api(`/api/orders/${encodeURIComponent(state.orderId)}`);
    if (state.screen !== 'status') return;
    if (res.ok) {
      const changed = res.body.status !== state.order?.status;
      state.order = res.body;
      if (changed) renderKeepingRef();
      if (FINAL.has(res.body.status)) return;
    }
  }
  pollTimer = setTimeout(poll, POLL_MS);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.screen === 'status') poll();
});

async function openStatus(orderId, { fresh = false } = {}) {
  stopPolling();
  state.orderId = orderId;
  showConnecting();
  const res = await api(`/api/orders/${encodeURIComponent(orderId)}`);
  if (!res.ok) {
    const code = failed(res);
    if (code !== 'UNAUTHORIZED') showFatal(code, () => openStatus(orderId));
    return;
  }
  state.order = res.body;
  // a new order starts over (nothing to go back to); from the shops strip, Back returns there
  if (fresh) state.stack = [];
  else if (state.screen && state.screen !== 'status') state.stack.push(state.screen);
  state.screen = 'status';
  state.error = '';
  render();
  pollTimer = setTimeout(poll, POLL_MS);
}

function copyButton(label, value) {
  return h(
    'button',
    {
      class: 'copy',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast(T('copied'));
        } catch {
          toast(value);
        }
      },
    },
    h('span', {}, label),
    h('b', {}, value)
  );
}

/** Re-render the status screen without losing what is typed in the reference box. */
function renderKeepingRef() {
  const typed = document.getElementById('ref')?.value;
  render();
  const box = document.getElementById('ref');
  if (box && typed) box.value = typed;
}

async function sendRef() {
  const input = document.getElementById('ref');
  const ref = input?.value.trim();
  if (!ref || state.busy) return;
  state.busy = true;
  renderKeepingRef();
  const res = await api(`/api/orders/${encodeURIComponent(state.orderId)}/ref`, { method: 'POST', body: { ref } });
  state.busy = false;
  if (!res.ok) {
    const code = failed(res);
    if (code === 'UNAUTHORIZED') return;
    if (code === 'BAD_TRANSITION') return openStatus(state.orderId, { fresh: true }); // an earlier try got through
    state.error = T(`err_${code}`);
    return renderKeepingRef();
  }
  haptic?.notificationOccurred('success');
  state.order = { ...state.order, status: res.body.status };
  state.error = '';
  render();
}

function statusScreen() {
  const o = state.order;
  const stage = STAGES.indexOf(o.status);
  const kids = [
    h('p', { class: 'hint' }, o.shopName),
    h('div', { class: 'status-big' }, T(`st_${o.status}`)),
  ];
  if (stage >= 0) kids.push(h('div', { class: 'steps', 'aria-hidden': 'true' }, STAGES.map((_, i) => h('i', { class: i <= stage ? 'on' : '' }))));
  if (o.eta && !FINAL.has(o.status)) kids.push(h('p', { class: 'hint' }, T('eta', o.eta)));

  let action = null;
  if (o.status === 'ACCEPTED' && o.pay) {
    const p = o.pay;
    const accounts = [];
    if (p.telebirr) accounts.push(copyButton('📱 Telebirr', p.telebirr));
    if (p.cbeAccount) accounts.push(copyButton('🏦 CBE', p.cbeAccount));
    if (!accounts.length && p.phone) accounts.push(copyButton(`📞 ${T('shopPhone')}`, p.phone));
    const guide = h('img', { class: 'guide', src: '/app/payment-guide.png', alt: '', loading: 'lazy' });
    guide.addEventListener('error', () => guide.remove());
    const ref = h('input', { id: 'ref', placeholder: T('refHint'), autocomplete: 'off', autocapitalize: 'characters', maxlength: 40 });
    ref.addEventListener('keydown', (e) => e.key === 'Enter' && sendRef());
    kids.push(
      h(
        'div',
        { class: 'panel' },
        h('p', { class: 'total' }, Number.isFinite(p.amount) ? T('payAmount', { amount: money(p.amount) }) : T('payByShop')),
        accounts,
        p.accountName ? h('p', {}, `👤 ${T('accountName')}: ${p.accountName}`) : null,
        h('p', { class: 'hint' }, T('tapToCopy')),
        field(T('refLabel'), ref),
        h('details', {}, h('summary', { class: 'hint' }, T('howToPay')), h('p', { class: 'hint' }, T('howToPayText')), guide)
      )
    );
    action = bar(T('sendRef'), sendRef);
  }
  if (o.rider && !FINAL.has(o.status)) {
    kids.push(h('div', { class: 'panel' }, h('p', {}, `🚲 ${T('rider')}: ${o.rider.name}`), o.rider.phone ? h('a', { href: `tel:${o.rider.phone}` }, `📞 ${o.rider.phone}`) : null));
  }

  const lines = o.lines.map((l) => h('div', { class: 'line' }, h('span', {}, `${l.qty} × ${l.name}`), h('span', {}, money(l.subtotal))));
  if (o.custom) lines.push(h('div', { class: 'line' }, h('span', {}, `✍️ “${o.custom}”`)));
  lines.push(h('div', { class: 'line' }, h('span', {}, `${T('deliveryFee')} + ${T('serviceFee')}`), h('span', {}, money((o.deliveryFee || 0) + (o.serviceFee || 0)))));
  kids.push(h('div', { class: 'panel' }, lines), h('p', { class: 'hint' }, T('chatNote')));

  if (FINAL.has(o.status) || !action) {
    action = bar(T('backToShops'), () => {
      stopPolling();
      if (FINAL.has(o.status) && state.me) state.me.openOrderId = null;
      home();
    });
  }
  return [...frame(T('orderTitle', { id: o.id }), ...kids), action];
}

start();
