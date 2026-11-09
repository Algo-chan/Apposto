// Safe HTML for customer messages. Template text is trusted (may hold <b>, <i>, <code>);
// every dynamic value is escaped unless the caller lists it in `raw`.
import { t } from '../i18n.js';

export const HTML = Object.freeze({ parse_mode: 'HTML' });

export function esc(value) {
  if (value == null) return '';
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function th(lang, key, params = {}, { raw = [] } = {}) {
  const safe = {};
  for (const [k, v] of Object.entries(params)) safe[k] = raw.includes(k) ? v : esc(v);
  return t(lang, key, safe);
}
