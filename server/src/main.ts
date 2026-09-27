import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildApp } from './app.js';
import { createProxyTrust } from './auth/proxy.js';
import { loadConfig } from './config.js';
import { openDatabase } from './store/connection.js';
import { issueSetupCode } from './store/setupCode.js';
import { hasAdmin } from './store/users.js';

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });
const db = openDatabase(join(config.dataDir, 'auralis.sqlite'));
const proxy = createProxyTrust(config.trustProxy);
await proxy.refresh();

const setupCodeFile = join(config.dataDir, 'setup-code');
const app = await buildApp({
  webDistDir: config.webDistDir,
  db,
  proxy,
  cookieSecure: config.cookieSecure,
  publicOrigin: config.publicOrigin,
  setupCodeFile,
  logger: true,
});

if (!hasAdmin(db)) {
  issueSetupCode(db, setupCodeFile);
  app.log.info(`No admin yet: the one-time setup code is in ${setupCodeFile}`);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => {
      db.close();
      process.exit(0);
    });
  });
}

await app.listen({ port: config.port, host: config.host });
