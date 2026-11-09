// Memoized, serialized picture rendering. Rendering is CPU-heavy on a 0.1 CPU host, so jobs run
// one at a time; a failure or timeout yields null and callers fall back to plain text.
export function createImageCache({ render, timeoutMs = 5000, log = console.warn }) {
  const pngs = new Map(); // key -> Promise<Buffer|null>
  const fileIds = new Map();
  let tail = Promise.resolve();

  function run(key, args) {
    const job = tail.then(async () => {
      let timer;
      try {
        const work = Promise.resolve().then(() => render(args));
        const timeout = new Promise((_, rej) => {
          timer = setTimeout(() => rej(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
        });
        const buf = await Promise.race([work, timeout]);
        if (!buf) throw new Error('empty render');
        return buf;
      } catch (err) {
        log(`🖼 render failed ${key}: ${err.message}`);
        pngs.delete(key);
        return null;
      } finally {
        clearTimeout(timer);
      }
    });
    tail = job.then(() => {}, () => {});
    return job;
  }

  return {
    png(key, args) {
      if (!pngs.has(key)) pngs.set(key, run(key, args));
      return pngs.get(key);
    },
    fileId: (key) => fileIds.get(key),
    remember: (key, fileId) => void fileIds.set(key, fileId),
  };
}
