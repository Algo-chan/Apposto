// Runtime helpers for hosting: honest health check, runner supervision, self keep-alive.

export function createHealthHandler({ isRunning, startedAt = Date.now() }) {
  return (req, res) => {
    if (req.url === '/' || req.url === '/health') {
      if (isRunning()) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, uptime: Math.round((Date.now() - startedAt) / 1000), runner: 'running' }));
      } else {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, runner: 'stopped' }));
      }
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  };
}

// Calls onCrash once if the runner's task settles while we are not stopping on purpose.
export function superviseRunner(handle, { onCrash, isStopping }) {
  let fired = false;
  const settled = (reason) => {
    if (fired || isStopping()) return;
    fired = true;
    onCrash(reason);
  };
  const task = handle.task();
  if (!task) {
    settled(new Error('runner is not running'));
    return;
  }
  task.then(() => settled(undefined), (err) => settled(err));
}

export function startKeepAlive({ baseUrl, intervalMs = 600000, timeoutMs = 10000, fetchFn = fetch, log = console.warn }) {
  if (!baseUrl) return () => {};
  const url = `${String(baseUrl).replace(/\/+$/, '')}/health`;
  const timer = setInterval(async () => {
    try {
      await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      log(`Keep-alive ping failed: ${err.message}`);
    }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
