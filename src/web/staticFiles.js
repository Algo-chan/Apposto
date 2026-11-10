// The mini app's files, read once at startup. Only these exact paths are ever served, so a
// crafted URL can't reach anything else on the disk.
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function entry(file) {
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!type) return null;
  return { body: fs.readFileSync(file), type, cache: type.startsWith('text/html') ? 'no-cache' : 'public, max-age=300' };
}

/**
 * dir: the folder whose files are served at /app/<name> (/app and /app/ are index.html).
 * extra: { '/app/name.png': '/path/on/disk' } added when the file exists.
 * -> Map(urlPath -> { body, type, cache })
 */
export function loadStaticFiles(dir, extra = {}) {
  const files = new Map();
  if (fs.existsSync(dir)) {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!d.isFile()) continue;
      const e = entry(path.join(dir, d.name));
      if (e) files.set(`/app/${d.name}`, e);
    }
  }
  for (const [url, file] of Object.entries(extra)) {
    if (file && fs.existsSync(file)) {
      const e = entry(file);
      if (e) files.set(url, e);
    }
  }
  const index = files.get('/app/index.html');
  if (index) {
    files.set('/app', index);
    files.set('/app/', index);
  }
  return files;
}
