import { execSync } from 'node:child_process';
import './env.js';
import { createApp } from './app.js';
import { initDb } from './db/index.js';
import { startHealthChecker, stopHealthChecker } from './services/health.js';
import { startCatalogSync, stopCatalogSync } from './services/catalog-sync.js';

const PORT = process.env.PORT ?? 3001;
// Dual-stack ('::') by default so the dashboard is reachable over both IPv4
// and IPv6 (e.g. IPv6-enabled Docker networks — #180). Hosts with IPv6
// disabled fall back to IPv4-only below; HOST overrides the default outright.
const HOST = process.env.HOST ?? '::';

async function main() {
  initDb();
  const app = createApp();

  // Express invokes this listen callback on ERROR as well as on success (see
  // express/lib/application.js app.listen → server.once('error', done)), so
  // guard against printing "Server running" for a failed bind (EADDRINUSE).
  const onReady = (host: string) => (err?: Error) => {
    if (err) return; // the server.on('error') handler below reports the failure
    const display = host.includes(':') ? `[${host}]` : host;
    console.log(`Server running on http://${display}:${PORT}`);
    console.log(`Proxy endpoint: http://${display}:${PORT}/v1/chat/completions`);
    startHealthChecker();
    startCatalogSync();
  };

  const server = app.listen(Number(PORT), HOST, onReady(HOST));

  // Graceful shutdown: the health/catalog intervals and open keep-alive
  // sockets otherwise keep the event loop busy after Ctrl+C, so `tsx watch`
  // reports "Previous process hasn't exited yet. Force killing..." and a fast
  // restart races the dying listener (EADDRINUSE).
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[server] ${signal} received — shutting down`);
    stopHealthChecker();
    stopCatalogSync();
    server.close(() => process.exit(0));
    server.closeIdleConnections?.();
    // Hard deadline: keep-alive clients must not block the next dev run.
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  server.on('error', (err: NodeJS.ErrnoException) => {
    // The default '::' bind fails where IPv6 is disabled (kernel
    // ipv6.disable=1 and the like) — retry IPv4-only rather than dying.
    // Anything else (EADDRINUSE, an explicit HOST that can't bind) keeps the
    // fail-fast posture documented in main().catch below.
    if (!process.env.HOST && (err.code === 'EAFNOSUPPORT' || err.code === 'EADDRNOTAVAIL')) {
      console.warn('[server] IPv6 unavailable on this host — falling back to 0.0.0.0 (IPv4-only)');
      app.listen(Number(PORT), '0.0.0.0', onReady('0.0.0.0'));
      return;
    }
    let hint = '';
    if (err.code === 'EADDRINUSE') {
      // Best-effort: show what is already bound to the port.
      try {
        const out = execSync(`ss -ltnp 'sport = :${PORT}' 2>/dev/null | tail -n +2`, { encoding: 'utf8' }).trim();
        if (out) hint += `Held by:\n${out}\n`;
      } catch { /* ss unavailable — generic hint below */ }
      hint += `Find it with: ss -ltnp | grep ${PORT} → kill <pid>, then retry.\n`;
    }
    console.error('\n[server] Failed to start:\n  ' + (err?.message ?? err) + '\n' + hint);
    process.exit(1);
  });
}

main().catch((err) => {
  // A boot failure (e.g. a missing production ENCRYPTION_KEY) must exit
  // non-zero rather than leaving a half-initialized process that never starts
  // listening — that silent state is what surfaces in the client as
  // "Can't reach the server".
  console.error('\n[server] Failed to start:\n  ' + (err?.message ?? err) + '\n');
  process.exit(1);
});
