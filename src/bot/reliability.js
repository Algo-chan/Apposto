// Middlewares that keep parallel chat handling safe and visible:
// chatKey (one queue per chat), autoAnswerCallbacks (no spinning buttons), slowUpdateLog,
// and telegramRetry (bounded retries for Telegram API calls).
import { HttpError } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function chatKey(ctx) {
  const id = ctx.chat?.id ?? ctx.from?.id;
  return id === undefined || id === null ? undefined : String(id);
}

// After the handler finishes, answer any callback query the handler forgot to answer.
// If the handler throws, rethrow untouched so bot.catch can show the error alert.
export function autoAnswerCallbacks() {
  return async (ctx, next) => {
    if (!ctx.callbackQuery) return next();
    let answered = false;
    const original = ctx.answerCallbackQuery.bind(ctx);
    ctx.answerCallbackQuery = (...args) => {
      answered = true;
      return original(...args);
    };
    await next();
    if (!answered) {
      try {
        await original();
      } catch {
        /* the query may have expired; nothing to do */
      }
    }
  };
}

// Log updates that take a long time to process (also when they fail).
export function slowUpdateLog({ thresholdMs = 3000, log = console.warn, now = Date.now } = {}) {
  return async (ctx, next) => {
    const start = now();
    const report = () => {
      const ms = now() - start;
      if (ms >= thresholdMs) {
        const type = Object.keys(ctx.update || {}).find((k) => k !== 'update_id') || 'unknown';
        log(`⏱ slow ${type} ${ms}ms chat=${chatKey(ctx)}`);
      }
    };
    try {
      await next();
    } finally {
      report();
    }
  };
}

/**
 * API transformer for every Telegram call except getUpdates.
 * getUpdates goes straight through: the runner retries polling itself at a fixed interval,
 * while auto-retry's network backoff doubles without counting, so after an outage the next
 * poll could come minutes late with the runner still reporting "running".
 * Other calls: rate limits (retry_after <= 30 s) and 5xx answers are retried by auto-retry,
 * at most 3 times; network errors are retried here, at most networkTries calls in total.
 */
export function telegramRetry({ networkTries = 3, delayMs = 1000, sleep = defaultSleep } = {}) {
  const retry = autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 30, rethrowHttpErrors: true });
  const bounded = (prev) => async (method, payload, signal) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await prev(method, payload, signal);
      } catch (err) {
        if (!(err instanceof HttpError) || signal?.aborted || attempt + 1 >= networkTries) throw err;
        await sleep(delayMs * 2 ** attempt);
      }
    }
  };
  return (prev, method, payload, signal) =>
    method === 'getUpdates' ? prev(method, payload, signal) : retry(bounded(prev), method, payload, signal);
}
