// Deep Pine + Mint picture cards (SVG -> PNG via resvg, with bundled fonts).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const PINE = '#0A2E25';
const CARD = '#0F362C';
const MINT = '#4BE3A4';
const YELLOW = '#FFC72C';
const WHITE = '#FFFFFF';
const OFF = '#25564A';
const FONT = 'Noto Sans, Noto Sans Ethiopic';

const asset = (p) => fileURLToPath(new URL(`../../assets/${p}`, import.meta.url));
const FONT_FILES = [asset('fonts/NotoSans-Bold.ttf'), asset('fonts/NotoSansEthiopic-Bold.ttf')];

let logoUri;
function logo() {
  logoUri ??= `data:image/png;base64,${readFileSync(asset('images/logo.png')).toString('base64')}`;
  return logoUri;
}

const x = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export function bannerSvg({ slogan, tagline, cta }) {
  const pillW = Math.min(900, Math.max(260, 80 + String(cta ?? '').length * 28));
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1280" height="640" viewBox="0 0 1280 640">
<defs><clipPath id="lg"><rect x="64" y="56" width="120" height="120" rx="28"/></clipPath></defs>
<rect width="1280" height="640" fill="${PINE}"/>
<circle cx="1120" cy="120" r="240" fill="${MINT}" opacity="0.18"/>
<circle cx="1240" cy="600" r="170" fill="${MINT}" opacity="0.18"/>
<image x="64" y="56" width="120" height="120" clip-path="url(#lg)" xlink:href="${logo()}" href="${logo()}"/>
<text x="64" y="330" font-family="${FONT}" font-weight="bold" font-size="64" fill="${WHITE}">${x(slogan)}</text>
<text x="64" y="400" font-family="${FONT}" font-size="32" fill="${WHITE}" fill-opacity="0.85">${x(tagline)}</text>
<rect x="64" y="470" width="${pillW}" height="84" rx="42" fill="${YELLOW}"/>
<text x="${64 + pillW / 2}" y="525" text-anchor="middle" font-family="${FONT}" font-weight="bold" font-size="32" fill="${PINE}">${x(cta)}</text>
</svg>`;
}

export function trackerSvg({ title, eta, stage, labels }) {
  const n = 6;
  const left = 80;
  const gap = 12;
  const w = (1280 - 2 * left - gap * (n - 1)) / n;
  let bars = '';
  let texts = '';
  for (let i = 1; i <= n; i++) {
    const bx = left + (i - 1) * (w + gap);
    const fill = i < stage ? MINT : i === stage ? YELLOW : OFF;
    bars += `<rect data-bar="1" x="${bx}" y="300" width="${w}" height="16" rx="8" fill="${fill}"/>\n`;
    texts += `<text x="${bx + w / 2}" y="360" text-anchor="middle" font-family="${FONT}" font-size="24" fill="${i === stage ? YELLOW : WHITE}">${x(labels?.[i - 1])}</text>\n`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="520" viewBox="0 0 1280 520">
<rect width="1280" height="520" fill="${PINE}"/>
<rect x="40" y="40" width="1200" height="440" rx="32" fill="${CARD}"/>
<text x="80" y="150" font-family="${FONT}" font-weight="bold" font-size="56" fill="${WHITE}">${x(title)}</text>
<text x="80" y="226" font-family="${FONT}" font-weight="bold" font-size="36" fill="${YELLOW}">${x(eta)}</text>
${bars}${texts}</svg>`;
}

export function renderPng(svg) {
  return new Resvg(svg, {
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'Noto Sans' },
    fitTo: { mode: 'width', value: 960 },
  })
    .render()
    .asPng();
}
