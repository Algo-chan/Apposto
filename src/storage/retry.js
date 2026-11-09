// Timeout and retry helper for Google Sheets calls: a hung request fails fast,
// and transient failures are retried with jittered exponential backoff.

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

const IDEMPOTENT_CODES = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_SOCKET',
]);
// Failures where the request certainly never reached the server.
const SAFE_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

export function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${ms}ms`);
      err.name = 'TimeoutError';
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * The system error code, also when wrapped: ky's NetworkError -> fetch's TypeError -> the
 * Node error that carries the code (e.g. ECONNREFUSED).
 */
function errorCode(err) {
  return err?.code ?? err?.cause?.code ?? err?.cause?.cause?.code;
}

export function isRetryable(err, { idempotent = true } = {}) {
  const status = err?.response?.status ?? err?.status;
  if (status === 429) return true;
  if (!idempotent) return SAFE_CODES.has(errorCode(err));
  if (status >= 500) return true;
  if (err?.name === 'TimeoutError' || err?.name === 'NetworkError') return true;
  if (IDEMPOTENT_CODES.has(errorCode(err))) return true;
  return err?.name === 'TypeError' && /fetch failed/.test(err?.message ?? '');
}

export async function withRetry(fn, {
  label,
  idempotent = true,
  tries = 3,
  timeoutMs = 10000,
  baseDelayMs = 500,
  sleep = defaultSleep,
  log = console.warn,
} = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await withTimeout(Promise.resolve().then(fn), timeoutMs, label);
    } catch (err) {
      if (attempt + 1 >= tries || !isRetryable(err, { idempotent })) throw err;
      const reason = err?.response?.status ?? errorCode(err) ?? err?.message ?? String(err);
      log(`↻ ${label} retry ${attempt + 1}/${tries - 1}: ${reason}`);
      await sleep(baseDelayMs * 2 ** attempt * (0.5 + Math.random()));
    }
  }
}
