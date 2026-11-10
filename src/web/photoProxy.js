// Serves item photos and shop banners to the mini app. Telegram keeps the images; this fetches
// one by its file_id, keeps it in memory (LRU, capped by bytes) and serves it from there. Only
// file ids that are a current item photo or shop banner are served, so this is never an open
// door to other files the bot has.

const DOWNLOAD_TIMEOUT_MS = 15000;

export function createPhotoProxy({ api, botToken, store, fetchFn = fetch, maxBytes = 30 * 2 ** 20, maxFileBytes = 5 * 2 ** 20 }) {
  const cache = new Map(); // fileId -> { body, type }, oldest first
  let cachedBytes = 0;
  const inFlight = new Map(); // fileId -> Promise

  async function isKnown(fileId) {
    const shops = await store.getMerchants();
    if (shops.some((m) => m.banner === fileId)) return true;
    for (const m of shops) if ((await store.getMenu(m.id)).some((i) => i.photo === fileId)) return true;
    return false;
  }

  function remember(fileId, entry) {
    cache.set(fileId, entry);
    cachedBytes += entry.body.length;
    for (const [id, old] of cache) {
      if (cachedBytes <= maxBytes || id === fileId) break;
      cache.delete(id);
      cachedBytes -= old.body.length;
    }
  }

  async function download(fileId) {
    const file = await api.getFile(fileId);
    if (!file?.file_path) throw new Error('no file_path');
    const res = await fetchFn(`https://api.telegram.org/file/bot${botToken}/${file.file_path}`, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`download HTTP ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > maxFileBytes) throw new Error(`file too big (${body.length} bytes)`);
    const type = file.file_path.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    return { body, type };
  }

  /** { body, type } or null (unknown id, or Telegram failed: logged). */
  async function get(fileId) {
    const hit = cache.get(fileId);
    if (hit) {
      cache.delete(fileId); // move to the newest end
      cache.set(fileId, hit);
      return hit;
    }
    if (inFlight.has(fileId)) return inFlight.get(fileId);
    const job = (async () => {
      try {
        if (!(await isKnown(fileId))) return null;
        const entry = await download(fileId);
        remember(fileId, entry);
        return entry;
      } catch (err) {
        console.error(`photo ${fileId} failed: ${err.description || err.message}`);
        return null;
      } finally {
        inFlight.delete(fileId);
      }
    })();
    inFlight.set(fileId, job);
    return job;
  }

  return { get };
}
