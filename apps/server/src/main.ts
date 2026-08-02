/**
 * The real process entrypoint (`pnpm dev` / `pnpm start`). Everything here is thin
 * wiring around `buildServer` — the actual behaviour lives in app.ts and routes/.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { FetchLike } from '@auralis/abs-client';
import { buildServer } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/connection.js';

const config = loadConfig();

let fetchImpl: FetchLike = fetch;
if (config.fakeUpstreams) {
  // Dynamic import so the fake (and its fixtures) are never pulled into a real
  // deployment's module graph unless AURALIS_FAKE_UPSTREAMS=1 is set — this is the
  // "offline dev mode" ARCHITECTURE.md describes, sharing the same fake the tests use.
  //
  // It lives under `src/`, not a sibling `test/`, precisely because of this line:
  // `AURALIS_FAKE_UPSTREAMS` is a runtime flag parsed by config.ts alongside PORT
  // and DATA_DIR, so the *shipped* server can be asked to load this at boot. A
  // `test/` directory is not copied into the Docker image, which made that mode
  // exit on an unresolvable import in the container while working fine locally.
  const { createFakeAbsUpstream } = await import('./testSupport/fakes/fakeAbs.js');
  fetchImpl = createFakeAbsUpstream().fetch;
}

const dbPath = config.dataDir === ':memory:' ? ':memory:' : join(config.dataDir, 'auralis.sqlite3');
if (config.dataDir !== ':memory:') mkdirSync(config.dataDir, { recursive: true });
const db = openDatabase(dbPath);

const app = buildServer({ db, config, fetch: fetchImpl });

if (config.fakeUpstreams) {
  app.log.warn('AURALIS_FAKE_UPSTREAMS=1 — serving fixture data, not a real Audiobookshelf');
}

try {
  const address = await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`Auralis server listening at ${address}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`Received ${signal}, shutting down gracefully`);
  try {
    await app.close();
  } finally {
    db.close();
    process.exit(0);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
