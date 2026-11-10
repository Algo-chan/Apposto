// The customer mini app: shops -> menu -> checkout -> confirm -> order tracking.
// The server checks everything again (prices, fees, who you are); this page only shows it.
import { createBasket, add, remove, count, foodTotal } from '/app/basket.js';
import { createApi } from '/app/net.js';
import { tr } from '/app/strings.js';

const tg = window.Telegram?.WebApp;
const inTelegram = Boolean(tg?.initData);
// Telegram's own Back button and vibration exist from app version 6.1; older apps get the page's Back.
const nativeBack = inTelegram && Boolean(tg.isVersionAtLeast?.('6.1'));
const haptic = nativeBack ? tg.HapticFeedback : null;
const initData = tg?.initData || window.__DEV_INIT_DATA__ || '';
const root = document.getElementById('app');
const SAVE_KEY = 'shop.v1';
const POLL_MS = 5000;
const FINAL = new Set(['DELIVERED', 'REJECTED', 'CANCELLED']);
const STAGES = ['PLACED', 'ACCEPTED', 'PAYMENT_SUBMITTED', 'CONFIRMED', 'READY', 'PICKED_UP', 'DELIVERED'];
const STATUS_EMOJI = { PLACED: '⏳', ACCEPTED: '💳', PAYMENT_SUBMITTED: '🔎', CONFIRMED: '👨‍🍳', READY: '🛍️', PICKED_UP: '🚲', DELIVERED: '🎉', REJECTED: '😔', CANCELLED: '✖️' };
const GREEN = '#128a43';
const BG = '#f5f6f8';

const state = {
  lang: 'en',
  me: null,
  shops: [],
  shop: null, // the open shop's card: { id, names, banner, eta, deliveryFeeFrom, rating }
  items: [], // its menu
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
  shopQuery: '',
  menuQuery: '',
};

let waking = false;
const api = createApi({
  initData,
  onRetry: () => {
    waking = true;
    showLoading();
  },
});
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
function go(screen) {
  if (state.screen) state.stack.push(state.screen);
  state.screen = screen;
  state.error = '';
  render();
  window.scrollTo(0, 0);
}
function back() {
  const prev = state.stack.pop();
  if (!prev) return;
  stopPolling();
  state.screen = prev;
  state.error = '';
  render();
}
function home() {
  stopPolling();
  state.stack = [];
  state.screen = null;
  loadShops();
}
if (nativeBack) tg.BackButton.onClick(back);

/** The page's own round Back button (when Telegram has none). */
function backButton() {
  return state.stack.length && !nativeBack ? h('button', { class: 'round-back', 'aria-label': 'Back', onclick: back }, '‹') : null;
}
function pageHead(title) {
  return h('div', { class: 'page-head' }, backButton(), h('h1', {}, title));
}
function errorBox() {
  return state.error ? h('p', { class: 'error-box', role: 'alert' }, state.error) : null;
}
function bar(content, onclick, { disabled = false, split = false } = {}) {
  return h('div', { class: 'bar' }, h('button', { class: split ? 'split' : '', onclick, disabled: disabled || state.busy }, state.busy ? T('sending') : content));
}

function render() {
  if (nativeBack) {
    if (state.stack.length) tg.BackButton.show();
    else tg.BackButton.hide();
  }
  const view = SCREENS[state.screen]?.() ?? [];
  root.replaceChildren(...view.flat().filter(Boolean));
}

function showLoading() {
  root.replaceChildren(
    h('div', { class: 'skeleton' }, h('div', { class: 'sk head' }), h('div', { class: 'sk card' }), h('div', { class: 'sk card' }), waking ? h('p', { class: 'waking' }, T('connecting')) : null)
  );
}
function showFatal(code, retry) {
  const kids = [h('p', {}, T(`err_${code}`))];
  if (retry) kids.push(h('div', { style: 'margin-top:16px' }, h('button', { class: 'btn primary', onclick: retry }, T('retry'))));
  root.replaceChildren(h('div', { class: 'center' }, ...kids));
}
/** An API answer that failed: its error code (and the 401 screen). */
function failed(res) {
  const code = res.body?.error || (res.status === 0 ? 'NETWORK' : 'ERROR');
  if (code === 'UNAUTHORIZED') showFatal('UNAUTHORIZED');
  return code;
}

// ---------- start ----------
async function start() {
  if (nativeBack) {
    try {
      tg.setHeaderColor(GREEN);
      tg.setBackgroundColor(BG);
      if (tg.isVersionAtLeast('7.10')) tg.setBottomBarColor('#ffffff');
    } catch {
      /* colours are a nicety */
    }
  }
  tg?.ready();
  tg?.expand();
  restore();
  showLoading();
  const me = await api('/api/me');
  waking = false;
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
  showLoading();
  const res = await api('/api/shops');
  waking = false;
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
  showLoading();
  const res = await api(`/api/shops/${encodeURIComponent(shop.id)}/menu`);
  waking = false;
  if (!res.ok) {
    const code = failed(res);
    if (code === 'UNAUTHORIZED') return;
    state.error = T(`err_${code}`);
    return render();
  }
  state.shop = res.body.shop;
  state.items = res.body.items;
  state.menuQuery = '';
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

// ---------- pieces ----------
function bannerEl(shop) {
  const fallback = () => h('div', { class: 'banner-fallback' }, nameOf(shop));
  if (!shop?.banner) return fallback();
  const img = h('img', { class: 'banner', src: shop.banner, alt: '', loading: 'lazy' });
  img.addEventListener('error', () => img.replaceWith(fallback()));
  return img;
}
function photoEl(item) {
  const fallback = () => h('div', { class: 'photo-fallback', 'aria-hidden': 'true' }, (nameOf(item)[0] || '•').toUpperCase());
  if (!item.photo) return fallback();
  const img = h('img', { class: 'photo', src: item.photo, alt: '', loading: 'lazy' });
  img.addEventListener('error', () => img.replaceWith(fallback()));
  return img;
}
function ratingEl(rating) {
  return rating ? h('span', { class: 'rating' }, `★ ${rating.avg.toFixed(1)}`) : h('span', { class: 'badge-new' }, T('newShop'));
}
function etaText(eta) {
  return eta ? T('etaShort', eta) : '';
}
function itemsText(n) {
  return n === 1 ? T('itemsOne') : T('itemsMany', { n });
}
function greeting() {
  const hour = new Date().getHours();
  const key = hour < 12 ? 'greetMorning' : hour < 17 ? 'greetAfternoon' : 'greetEvening';
  const name = state.me?.firstName || '';
  return name ? T(key, { name }) : T(key, { name: '' }).replace(/[,،፣]\s*👋/, ' 👋');
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
function cardTitle(icon, text) {
  return h('div', { class: 'card-title' }, h('span', { class: 'ic', 'aria-hidden': 'true' }, icon), text);
}
function matches(rec, query) {
  const q = query.trim().toLowerCase();
  return !q || Object.values(rec.names || {}).some((n) => String(n).toLowerCase().includes(q));
}

// ---------- screens ----------
const SCREENS = {
  lang: () => [
    h(
      'div',
      { class: 'welcome' },
      h('img', { src: '/app/logo.png', alt: '' }),
      h('h1', {}, state.me?.brand || ''),
      h('div', { class: 'langs' }, [['om', 'Afaan Oromoo'], ['am', 'አማርኛ'], ['en', 'English']].map(([l, label]) => h('button', { class: 'lang', onclick: () => chooseLang(l) }, label))),
      h('p', { class: 'hint' }, `${tr('om', 'chooseLang')} · ${tr('am', 'chooseLang')} · ${tr('en', 'chooseLang')}`)
    ),
  ],
  shops: () => shopsScreen(),
  menu: () => menuScreen(),
  basket: () => basketScreen(),
  confirm: () => confirmScreen(),
  status: () => statusScreen(),
};

function shopList() {
  const list = state.shops.filter((s) => matches(s, state.shopQuery));
  return h(
    'div',
    { class: 'shops', id: 'shop-list' },
    list.length ? list.map(shopCard) : h('p', { class: 'empty' }, state.shops.length ? T('noResults') : T('noShops'))
  );
}

function shopsScreen() {
  const search = h('input', { type: 'search', placeholder: T('searchShops'), 'aria-label': T('searchShops') });
  search.value = state.shopQuery;
  search.addEventListener('input', () => {
    state.shopQuery = search.value;
    document.getElementById('shop-list')?.replaceWith(shopList());
    const c = document.getElementById('shop-count');
    if (c) c.textContent = String(state.shops.filter((s) => matches(s, state.shopQuery)).length);
  });

  const head = h(
    'header',
    { class: 'hero-head' },
    h(
      'div',
      { class: 'brand-row' },
      h('img', { src: '/app/logo.png', alt: '' }),
      h('div', {}, h('div', { class: 'brand' }, state.me?.brand || ''), h('div', { class: 'where' }, `📍 ${T('deliveringIn')}`)),
      h('button', { class: 'lang-btn', 'aria-label': T('language'), onclick: () => go('lang') }, `🌐 ${state.lang.toUpperCase()}`)
    ),
    h('div', { class: 'greet' }, greeting()),
    h('p', { class: 'greet-sub' }, T('hungryLine')),
    h('label', { class: 'search' }, h('span', { 'aria-hidden': 'true' }, '🔍'), search)
  );
  const live = state.order
    ? h(
        'button',
        { class: 'live-order', onclick: () => openStatus(state.order.id) },
        h('span', { class: 'pulse', 'aria-hidden': 'true' }),
        h('span', { class: 'txt' }, h('b', {}, T(`st_${state.order.status}`)), h('span', { class: 'muted small' }, `${state.order.shopName} · ${state.order.id}`)),
        h('span', { class: 'go' }, `${T('track')} ›`)
      )
    : null;
  const chips = h('div', { class: 'chips' }, h('span', { class: 'chip' }, T('trustBike')), h('span', { class: 'chip' }, T('trustPay')), h('span', { class: 'chip' }, T('trustLocal')));

  const n = count(state.basket);
  const basketShop = state.shops.find((s) => s.id === state.basket.merchantId);
  const basketBar = n && basketShop ? bar(barContent(n), () => openShop(basketShop), { split: true }) : null;
  return [
    head,
    errorBox(),
    live,
    chips,
    h('h2', { class: 'section-title' }, T('allShops'), h('span', { class: 'count', id: 'shop-count' }, String(state.shops.filter((s) => matches(s, state.shopQuery)).length))),
    shopList(),
    basketBar,
  ];
}

function shopCard(s) {
  return h(
    'button',
    { class: 'shop', onclick: () => openShop(s) },
    h('div', { class: 'media' }, bannerEl(s), s.eta ? h('span', { class: 'pill' }, `⏱ ${etaText(s.eta)}`) : null),
    h(
      'div',
      { class: 'info' },
      h('div', { class: 'name' }, nameOf(s)),
      h('div', { class: 'meta' }, ratingEl(s.rating), h('span', { class: 'dot' }), h('span', {}, `🚲 ${T('deliveryFrom', { fee: money(s.deliveryFeeFrom) })}`))
    )
  );
}

/** Basket bar: count + food total on the left (when the menu is known), "View basket ›" on the right. */
function barContent(n) {
  const known = state.shop?.id === state.basket.merchantId;
  const total = known ? foodTotal(state.basket, itemsById()) : null;
  return [
    h('span', { class: 'left' }, h('span', {}, h('span', { class: 'badge', 'aria-label': itemsText(n) }, String(n)), total != null && n ? money(total) : itemsText(n))),
    h('span', {}, `${T('viewBasketShort')} ›`),
  ];
}

function itemList() {
  const items = state.items.filter((i) => matches(i, state.menuQuery));
  if (!state.items.length) return h('p', { class: 'empty', id: 'item-list' }, T('menuEmpty'));
  if (!items.length) return h('p', { class: 'empty', id: 'item-list' }, T('noResults'));
  return h('div', { class: 'items', id: 'item-list' }, items.map(itemRow));
}

function menuScreen() {
  const s = state.shop;
  const search = h('input', { type: 'search', placeholder: T('searchMenu'), 'aria-label': T('searchMenu') });
  search.value = state.menuQuery;
  search.addEventListener('input', () => {
    state.menuQuery = search.value;
    document.getElementById('item-list')?.replaceWith(itemList());
  });

  const inThisShop = state.basket.merchantId === s.id;
  const n = inThisShop ? count(state.basket) : 0;
  const show = inThisShop && (n > 0 || state.basket.custom);
  return [
    h('div', { class: 'shop-hero' }, bannerEl(s), backButton(), h('h1', {}, nameOf(s))),
    h(
      'div',
      { class: 'info-card' },
      h('div', {}, h('b', {}, s.rating ? `★ ${s.rating.avg.toFixed(1)}` : T('newShop')), h('span', {}, s.rating ? `(${s.rating.count})` : '⭐')),
      h('div', {}, h('b', {}, etaText(s.eta) || '—'), h('span', {}, '⏱')),
      h('div', {}, h('b', {}, money(s.deliveryFeeFrom)), h('span', {}, `🚲 ${T('deliveryFee')}`))
    ),
    errorBox(),
    state.items.length > 5 ? h('label', { class: 'menu-search' }, h('span', { 'aria-hidden': 'true' }, '🔍'), search) : null,
    h('h2', { class: 'section-title' }, T('menuTitle'), h('span', { class: 'count' }, String(state.items.length))),
    itemList(),
    show ? bar(barContent(n), openBasket, { split: true }) : null,
  ];
}

function itemRow(item) {
  const qty = state.basket.merchantId === state.shop.id ? state.basket.items[item.id] || 0 : 0;
  return h(
    'div',
    { class: 'item' },
    h('div', { class: 'text' }, h('div', { class: 'name' }, nameOf(item)), h('div', { class: 'price' }, money(item.price))),
    h('div', { class: 'pic' }, photoEl(item), qty ? stepper(item.id, qty) : h('button', { class: 'add', onclick: () => change(item.id, +1) }, T('add')))
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
      if (nativeBack && tg.showPopup) {
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

// ---------- checkout ----------
/** The checkout screen; a location chosen earlier (saved in this tab) gets its fee again. */
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

/** Bill: item total, delivery, service, total; then who gets what (shop by Telebirr/CBE, rider in cash). */
function billCard(q, food, hasItems, custom) {
  const foodShown = hasItems ? `${money(food)}${custom ? ` ${T('plusRequest')}` : ''}` : T('priceByShop');
  const cash = q.deliveryFee + q.serviceFee;
  return h(
    'div',
    { class: 'card' },
    cardTitle('🧾', T('billSummary')),
    h('div', { class: 'line' }, h('span', { class: 'what' }, T('itemTotal')), h('span', {}, foodShown)),
    h('div', { class: 'line' }, h('span', { class: 'what' }, T('deliveryFee'), Number.isFinite(q.distanceKm) ? h('small', {}, `~${q.distanceKm} km`) : null), h('span', {}, money(q.deliveryFee))),
    h('div', { class: 'line' }, h('span', { class: 'what' }, T('serviceFee')), h('span', {}, money(q.serviceFee))),
    h('div', { class: 'line total-line' }, h('span', {}, T('toPay')), h('span', {}, hasItems ? money(food + cash) : `${money(cash)} +`)),
    h('div', { class: 'split-pay' }, h('div', {}, h('span', {}, `🏪 ${T('payShop')}`), h('span', {}, hasItems ? money(food) : '—')), h('div', {}, h('span', {}, `🚲 ${T('cashToRider')}`), h('span', {}, money(cash))))
  );
}

function basketScreen() {
  const byId = itemsById();
  const lines = Object.entries(state.basket.items).map(([id, qty]) => {
    const item = byId.get(id);
    return h('div', { class: 'line' }, h('span', { class: 'what' }, nameOf(item), h('small', {}, money(item.price * qty))), stepper(id, qty));
  });

  const custom = h('textarea', { id: 'custom', maxlength: 300, placeholder: T('specialRequestHint') });
  custom.value = state.basket.custom;
  custom.addEventListener('input', () => {
    state.basket = { ...state.basket, custom: custom.value };
    save();
    updateContinue();
  });

  const f = state.form;
  const locNote = {
    none: null,
    busy: h('p', { class: 'note muted' }, T('locating')),
    set: h('p', { class: 'note ok' }, Number.isFinite(state.quote?.distanceKm) ? T('locationSet', { km: state.quote.distanceKm }) : T('locationSetPlain')),
    skipped: h('p', { class: 'note muted' }, T('locationSkipped')),
    failed: h('p', { class: 'note err' }, T('locationFailed')),
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
  const b = bar(T('continue'), () => {
    if (!detailsReady()) return;
    if (!state.requestId) state.requestId = newRequestId();
    go('confirm');
  }, { disabled: !detailsReady() });
  b.id = 'continue-bar';

  return [
    pageHead(T('checkoutTitle')),
    errorBox(),
    h('div', { class: 'card' }, cardTitle('🧺', `${T('yourOrder')} · ${nameOf(state.shop)}`), lines.length ? lines : h('p', { class: 'muted' }, T('err_EMPTY')), field(T('specialRequest'), custom)),
    h(
      'div',
      { class: 'card' },
      cardTitle('📍', T('locationTitle')),
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn primary', onclick: useLocation, disabled: f.loc === 'busy' }, T('useLocation')),
        h('button', { class: 'btn ghost', onclick: skipLocation }, T('skipLocation'))
      ),
      locNote,
      field(T('landmark'), landmark)
    ),
    h('div', { class: 'card' }, cardTitle('📞', T('contactTitle')), field(T('phone'), phone), canShare ? h('div', { style: 'margin-top:8px' }, h('button', { class: 'btn outline', onclick: sharePhone }, T('sharePhone'))) : null),
    q ? billCard(q, food, hasItems, state.basket.custom.trim()) : null,
    q?.outOfRange ? h('p', { class: 'error-box' }, T('err_OUT_OF_RANGE')) : null,
    h('div', { class: 'trust' }, h('span', { 'aria-hidden': 'true' }, '🔒'), h('span', {}, T('trustLine'))),
    b,
  ];
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
  const custom = state.basket.custom.trim();
  const lines = Object.entries(state.basket.items).map(([id, qty]) =>
    h('div', { class: 'line' }, h('span', { class: 'what' }, `${qty} × ${nameOf(byId.get(id))}`), h('span', {}, money(byId.get(id).price * qty)))
  );
  if (custom) lines.push(h('div', { class: 'line' }, h('span', { class: 'what' }, `✍️ “${custom}”`)));
  return [
    pageHead(T('confirmTitle')),
    errorBox(),
    h('div', { class: 'card' }, cardTitle('🏪', nameOf(state.shop)), lines),
    h(
      'div',
      { class: 'card' },
      cardTitle('📍', T('locationTitle')),
      h('p', {}, state.form.landmark.trim()),
      h('p', { class: 'muted small', style: 'margin-top:4px' }, `📞 ${state.form.phone.trim()}`),
      q.eta ? h('p', { class: 'note ok' }, `⏱ ${T('eta', q.eta)}`) : null
    ),
    billCard(q, food, hasItems, custom),
    h('div', { class: 'trust' }, h('span', { 'aria-hidden': 'true' }, '🔒'), h('span', {}, T('payShopNote'))),
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
    state.shop = res.body.shop;
    state.items = res.body.items;
    pruneBasket();
  }
}

// ---------- order tracking ----------
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
      if (changed) {
        haptic?.notificationOccurred('success');
        renderKeepingRef();
      }
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
  showLoading();
  const res = await api(`/api/orders/${encodeURIComponent(orderId)}`);
  waking = false;
  if (!res.ok) {
    const code = failed(res);
    if (code !== 'UNAUTHORIZED') showFatal(code, () => openStatus(orderId));
    return;
  }
  state.order = res.body;
  // a new order starts over (nothing to go back to); from the home card, Back returns there
  if (fresh) state.stack = [];
  else if (state.screen && state.screen !== 'status') state.stack.push(state.screen);
  state.screen = 'status';
  state.error = '';
  render();
  window.scrollTo(0, 0);
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
        haptic?.impactOccurred('light');
      },
    },
    h('span', {}, label),
    h('span', {}, h('b', {}, value), h('span', { class: 'cp' }, '⧉'))
  );
}

/** Re-render the tracking screen without losing what is typed in the reference box. */
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

function timeline(o) {
  const stage = STAGES.indexOf(o.status);
  return h(
    'ol',
    { class: 'timeline' },
    STAGES.map((st, i) => {
      const cls = i < stage || o.status === 'DELIVERED' ? 'done' : i === stage ? 'now' : '';
      return h(
        'li',
        { class: cls },
        h('span', { class: 'node', 'aria-hidden': 'true' }, cls === 'done' ? '✓' : String(i + 1)),
        h('span', { class: 'label' }, T(`tl_${st}`)),
        o.times?.[st] ? h('span', { class: 'time' }, o.times[st]) : null
      );
    })
  );
}

function paymentCard(o) {
  const p = o.pay;
  const accounts = [];
  if (p.telebirr) accounts.push(copyButton('📱 Telebirr', p.telebirr));
  if (p.cbeAccount) accounts.push(copyButton('🏦 CBE', p.cbeAccount));
  if (!accounts.length && p.phone) accounts.push(copyButton(`📞 ${T('shopPhone')}`, p.phone));
  const guide = h('img', { class: 'guide', src: '/app/payment-guide.png', alt: '', loading: 'lazy' });
  guide.addEventListener('error', () => guide.remove());
  const ref = h('input', { id: 'ref', placeholder: T('refHint'), autocomplete: 'off', autocapitalize: 'characters', maxlength: 40 });
  ref.addEventListener('keydown', (e) => e.key === 'Enter' && sendRef());
  return h(
    'div',
    { class: 'card' },
    cardTitle('💳', T('paymentTitle')),
    Number.isFinite(p.amount) ? h('p', { class: 'amount' }, T('payAmount', { amount: money(p.amount) })) : h('p', {}, T('payByShop')),
    accounts,
    p.accountName ? h('p', { class: 'note muted' }, `👤 ${T('accountName')}: ${p.accountName}`) : null,
    h('p', { class: 'note muted' }, T('tapToCopy')),
    field(T('refLabel'), ref),
    h('details', {}, h('summary', {}, T('howToPay')), h('p', { class: 'note muted' }, T('howToPayText')), guide)
  );
}

function statusScreen() {
  const o = state.order;
  const bad = o.status === 'REJECTED' || o.status === 'CANCELLED';
  const hero = h(
    'div',
    { class: `track-hero${bad ? ' bad' : ''}` },
    backButton() ? h('div', { style: 'text-align:left;height:38px;position:relative' }, backButton()) : null,
    h('div', { class: 'id' }, `${o.shopName} · ${o.id}`),
    h('div', { class: 'emoji', 'aria-hidden': 'true' }, STATUS_EMOJI[o.status] || '📦'),
    h('h1', {}, T(`st_${o.status}`)),
    o.eta && !FINAL.has(o.status) ? h('div', { class: 'eta' }, `⏱ ${T('eta', o.eta)}`) : null
  );

  const payNow = o.status === 'ACCEPTED' && o.pay;
  const lines = o.lines.map((l) => h('div', { class: 'line' }, h('span', { class: 'what' }, `${l.qty} × ${l.name}`), h('span', {}, money(l.subtotal))));
  if (o.custom) lines.push(h('div', { class: 'line' }, h('span', { class: 'what' }, `✍️ “${o.custom}”`)));
  lines.push(h('div', { class: 'line' }, h('span', { class: 'what' }, `🚲 ${T('cashToRider')}`), h('span', {}, money((o.deliveryFee || 0) + (o.serviceFee || 0)))));

  const action = payNow
    ? bar(T('sendRef'), sendRef)
    : bar(T('backToShops'), () => {
        if (FINAL.has(o.status) && state.me) state.me.openOrderId = null;
        home();
      });

  return [
    hero,
    errorBox(),
    payNow ? paymentCard(o) : null,
    o.rider && !FINAL.has(o.status)
      ? h(
          'div',
          { class: 'card' },
          h(
            'div',
            { class: 'rider' },
            h('div', { class: 'avatar', 'aria-hidden': 'true' }, '🚲'),
            h('div', { class: 'who' }, h('b', {}, o.rider.name), h('div', { class: 'muted small' }, T('rider'))),
            o.rider.phone ? h('a', { href: `tel:${o.rider.phone}`, 'aria-label': o.rider.phone }, '📞') : null
          )
        )
      : null,
    STAGES.includes(o.status) ? h('div', { class: 'card' }, cardTitle('🧭', T('trackTitle')), timeline(o)) : null,
    h('div', { class: 'card' }, cardTitle('🧾', T('orderDetails')), lines),
    o.canCancel ? h('button', { class: 'cancel-link', onclick: askCancel }, T('cancelOrder')) : null,
    h('p', { class: 'muted small pad', style: 'margin-top:12px;text-align:center' }, T('chatNote')),
    action,
  ];
}

/** "Cancel this order?" then cancel (only while the shop has not confirmed the payment). */
function askCancel() {
  if (nativeBack && tg.showPopup) {
    tg.showPopup(
      { message: T('cancelConfirm'), buttons: [{ id: 'yes', type: 'destructive', text: T('cancelYes') }, { id: 'no', type: 'cancel' }] },
      (id) => id === 'yes' && cancelOrder()
    );
  } else if (window.confirm(T('cancelConfirm'))) cancelOrder();
}

async function cancelOrder() {
  if (state.busy) return;
  state.busy = true;
  renderKeepingRef();
  const res = await api(`/api/orders/${encodeURIComponent(state.orderId)}/cancel`, { method: 'POST', body: {} });
  state.busy = false;
  if (!res.ok) {
    const code = failed(res);
    if (code === 'UNAUTHORIZED') return;
    state.error = T(`err_${code}`);
    return renderKeepingRef();
  }
  haptic?.notificationOccurred('warning');
  if (state.me) state.me.openOrderId = null;
  openStatus(state.orderId, { fresh: true });
}

start();
