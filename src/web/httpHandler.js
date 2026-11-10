// The one HTTP server on the host: health check, photos, and the mini app (static files + API).

const FILE_ID = /^[A-Za-z0-9_-]{10,255}$/;
const IMMUTABLE = 'public, max-age=31536000, immutable';

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

/** health: createHealthHandler(...) result; photos: createPhotoProxy(...) result. */
export function createHttpHandler({ health, photos }) {
  return async (req, res) => {
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

    return notFound(res);
  };
}
