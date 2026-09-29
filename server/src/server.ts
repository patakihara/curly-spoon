/**
 * The whole server from its configuration: the database, the sign-on, each upstream's
 * provisioner and the app, wired as they run. `main.ts` starts it with the network's `fetch`;
 * anything else that runs the server (a harness on recordings) passes its own `fetch` here and
 * changes nothing else.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { AbsProvisioner } from './adapters/audiobookshelf/provision.js';
import type { FetchLike } from './adapters/http/fetch.js';
import { JellyfinProvisioner } from './adapters/jellyfin/quickConnect.js';
import { type BuildAppOptions, buildApp } from './app.js';
import { OidcClient } from './auth/oidc.js';
import { createProxyTrust } from './auth/proxy.js';
import type { AppConfig } from './config.js';
import { loadSecretKey } from './crypto/secretBox.js';
import { readSecretFile } from './secretFile.js';
import { openDatabase } from './store/connection.js';
import { startSessionSweep } from './store/sessions.js';
import { issueSetupCode } from './store/setupCode.js';
import { hasAdmin } from './store/users.js';
import { Linker, type Provisioner } from './upstream/links.js';

export interface Server {
  /** Built and ready, not yet listening. */
  app: FastifyInstance;
  /** Closes the app, stops the session sweep and closes the database. */
  close(): Promise<void>;
}

export async function assembleServer(
  config: AppConfig,
  deps: { fetch: FetchLike; logger?: BuildAppOptions['logger'] },
): Promise<Server> {
  const { fetch } = deps;
  mkdirSync(config.dataDir, { recursive: true });
  const db = openDatabase(join(config.dataDir, 'auralis.sqlite'));
  const stopSessionSweep = startSessionSweep(db);
  const proxy = createProxyTrust(config.trustProxy);
  await proxy.refresh();

  const secretKey = loadSecretKey({ file: config.secretKeyFile, env: config.secretKey });

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
    commit: config.commit,
    setupCodeFile,
    signOn,
    linker,
    upstreams: {
      key: secretKey,
      config: { absUrl: config.abs?.url, jellyfinUrl: config.jellyfin?.url },
      fetch,
      linker,
    },
    logger: deps.logger ?? true,
  });

  if (!hasAdmin(db)) {
    issueSetupCode(db, setupCodeFile);
    app.log.info(`No admin yet: the one-time setup code is in ${setupCodeFile}`);
  }

  return {
    app,
    async close() {
      await app.close();
      stopSessionSweep();
      db.close();
      app.log.info('Database closed');
    },
  };
}
