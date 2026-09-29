import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AbsProvisioner } from './adapters/audiobookshelf/provision.js';
import { JellyfinProvisioner } from './adapters/jellyfin/quickConnect.js';
import { buildApp } from './app.js';
import { OidcClient } from './auth/oidc.js';
import { createProxyTrust } from './auth/proxy.js';
import { loadConfig } from './config.js';
import { loadSecretKey } from './crypto/secretBox.js';
import { readSecretFile } from './secretFile.js';
import { openDatabase } from './store/connection.js';
import { startSessionSweep } from './store/sessions.js';
import { issueSetupCode } from './store/setupCode.js';
import { hasAdmin } from './store/users.js';
import { Linker, type Provisioner } from './upstream/links.js';

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });
const db = openDatabase(join(config.dataDir, 'auralis.sqlite'));
const stopSessionSweep = startSessionSweep(db);
const proxy = createProxyTrust(config.trustProxy);
await proxy.refresh();

const secretKey = loadSecretKey({ file: config.secretKeyFile, env: config.secretKey });
const fetch = (url: string, init?: RequestInit) => globalThis.fetch(url, init);

const signOn =
  config.oidc === null
    ? null
    : new OidcClient({
        issuer: config.oidc.issuer,
        clientId: config.oidc.clientId,
        clientSecret: readSecretFile(config.oidc.clientSecretFile, 'OIDC_CLIENT_SECRET'),
        redirectUri: config.oidc.redirectUri,
        fetch,
        now: Date.now,
      });

const provisioners: Provisioner[] = [];
if (config.abs !== null) {
  provisioners.push(
    new AbsProvisioner({
      baseUrl: config.abs.url,
      provisionKey: readSecretFile(config.abs.keyFile, 'ABS_PROVISION_KEY'),
      fetch,
    }),
  );
}
if (config.jellyfin !== null) {
  provisioners.push(
    new JellyfinProvisioner({
      baseUrl: config.jellyfin.url,
      apiKey: readSecretFile(config.jellyfin.keyFile, 'JELLYFIN_API_KEY'),
      fetch,
    }),
  );
}
const linker = new Linker({ db, key: secretKey, provisioners });

const setupCodeFile = join(config.dataDir, 'setup-code');
const app = await buildApp({
  webDistDir: config.webDistDir,
  db,
  proxy,
  cookieSecure: config.cookieSecure,
  publicOrigin: config.publicOrigin,
  setupCodeFile,
  signOn,
  linker,
  upstreams: {
    key: secretKey,
    config: { absUrl: config.abs?.url, jellyfinUrl: config.jellyfin?.url },
    fetch,
    linker,
  },
  logger: true,
});

if (!hasAdmin(db)) {
  issueSetupCode(db, setupCodeFile);
  app.log.info(`No admin yet: the one-time setup code is in ${setupCodeFile}`);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().then(() => {
      stopSessionSweep();
      db.close();
      process.exit(0);
    });
  });
}

await app.listen({ port: config.port, host: config.host });
