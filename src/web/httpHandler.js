// The one HTTP server on the host: health check, photos, and the mini app (static files + API).
import { verifyInitData } from './initData.js';

const FILE_ID = /^[A-Za-z0-9_-]{10,255}$/;
const IMMUTABLE = 'public, max-age=31536000, immutable';
const MAX_BODY = 16 * 1024;
// The page may only load our own files, Telegram's script and Google's font; nothing else can
// run in it, and only Telegram may show it inside a frame.
const PAGE_POLICY = [
  "default-src 'self'",
  "script-src 'self' https://telegram.org",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
].join('; ');

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

/** The request's JSON body (POST only); { tooBig } / { bad } when it can't be used. */
function readJson(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        finish({ tooBig: true });
        return;
      }
      if (!done) chunks.push(c);
    });
    req.on('end', () => {
      if (done) return;
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return finish({ body: {} });
      try {
        finish({ body: JSON.parse(text) });
      } catch {
        finish({ bad: true });
      }
    });
    req.on('error', () => finish({ bad: true }));
  });
}

/**
 * health: createHealthHandler(...) result; photos: createPhotoProxy(...) result;
 * api: createWebApi(...) result; staticFiles: loadStaticFiles(...) result; botToken: checks initData.
 */
export function createHttpHandler({ health, photos, api = null, staticFiles = null, botToken = '' }) {
  async function handleApi(req, res, path) {
    const auth = String(req.headers.authorization || '');
    const verified = auth.startsWith('tma ') ? verifyInitData(auth.slice(4), botToken) : null;
    if (!verified) return sendJson(res, 401, { error: 'UNAUTHORIZED' });
    let body;
    if (req.method === 'POST') {
      const got = await readJson(req);
      if (got.tooBig) {
        res.setHeader('Connection', 'close');
        return sendJson(res, 413, { error: 'BAD_REQUEST' });
      }
      if (got.bad) return sendJson(res, 400, { error: 'BAD_REQUEST' });
      body = got.body;
    }
    const out = await api.handle(req.method, path, { user: verified.user, body });
    return sendJson(res, out.status, out.body);
  }

  return async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      let path;
      try {
        path = new URL(req.url, 'http://localhost').pathname;
      } catch {
        return notFound(res);
      }
      if (path === '/' || path === '/health') return health(req, res);

      if (path.startsWith('/img/') && (req.method === 'GET' || req.method === 'HEAD')) {
        const fileId = path.slice('/img/'.length);
        if (!FILE_ID.test(fileId)) return notFound(res);
        const photo = await photos.get(fileId);
        if (!photo) return notFound(res);
        res.writeHead(200, { 'Content-Type': photo.type, 'Content-Length': photo.body.length, 'Cache-Control': IMMUTABLE });
        return res.end(req.method === 'HEAD' ? undefined : photo.body);
      }

      if (api && path.startsWith('/api/')) return await handleApi(req, res, path);

      const file = staticFiles?.get(path);
      if (file && (req.method === 'GET' || req.method === 'HEAD')) {
        if (file.type.startsWith('text/html')) res.setHeader('Content-Security-Policy', PAGE_POLICY);
        res.writeHead(200, { 'Content-Type': file.type, 'Content-Length': file.body.length, 'Cache-Control': file.cache });
        return res.end(req.method === 'HEAD' ? undefined : file.body);
      }
      return notFound(res);
    } catch (err) {
      console.error(`http ${req.method} ${req.url} failed:`, err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error');
      }
    }
  };
}
