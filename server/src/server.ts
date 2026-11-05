/**
 * The whole server from its configuration: the database, the sign-on, each upstream's
 * provisioner, the app with its request job, the library index job and the lyrics backfill, wired as they run. `main.ts` starts it with the network's `fetch`;
 * anything else that runs the server (a harness on recordings) passes its own `fetch` here and
 * changes nothing else.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { AbsClient } from './adapters/audiobookshelf/client.js';
import { AbsProvisioner } from './adapters/audiobookshelf/provision.js';
import type { FetchLike } from './adapters/http/fetch.js';
import { JellyfinClient } from './adapters/jellyfin/client.js';
import { JellyfinProvisioner } from './adapters/jellyfin/quickConnect.js';
import { type BuildAppOptions, buildApp } from './app.js';
import { OidcClient } from './auth/oidc.js';
import { createProxyTrust } from './auth/proxy.js';
import type { AppConfig } from './config.js';
import { loadSecretKey } from './crypto/secretBox.js';
import { startIndexJob } from './libraryIndex/start.js';
import { lyricsService, startLyricsJob } from './lyrics/start.js';
import { type MediumSteps, stepsRegistry } from './requests/steps.js';
import type { Upstreams } from './upstream/links.js';
import { readSecretFile } from './secretFile.js';
import { openDatabase } from './store/connection.js';
import { startSessionSweep } from './store/sessions.js';
import { issueSetupCode } from './store/setupCode.js';
import { hasAdmin } from './store/users.js';
import { Linker, type Provisioner } from './upstream/links.js';

export interface Server {
  /** Built and ready, not yet listening. */
  app: FastifyInstance;
  /** Closes the app, stops the session sweep and both jobs, and closes the database. */
  close(): Promise<void>;
}

/**
 * Auralis's own clients, which act where a person's own account does not reach: the listen-only
 * Audiobookshelf key, and Jellyfin's API key.
 */
function householdClients(config: AppConfig, fetch: FetchLike): Upstreams {
  const { abs, jellyfin, index } = config;
  return {
    abs:
      abs === null || index.absKeyFile === null
        ? null
        : new AbsClient({
            baseUrl: abs.url,
            token: readSecretFile(index.absKeyFile, 'ABS_API_KEY'),
            fetch,
          }),
    jellyfin:
      jellyfin === null
        ? null
        : new JellyfinClient({
            baseUrl: jellyfin.url,
            token: readSecretFile(jellyfin.keyFile, 'JELLYFIN_API_KEY'),
            fetch,
            serverKey: true,
          }),
  };
}

export async function assembleServer(
  config: AppConfig,
  deps: {
    fetch: FetchLike;
    logger?: BuildAppOptions['logger'];
    /** The steps of each medium that can be requested; `main.ts` gives none until each lands. */
    steps?: readonly MediumSteps[];
  },
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

  // One lyrics service for the route and the backfill; it logs through the app once built.
  const lyrics = lyricsService(config, {
    db,
    fetch,
    log: { warn: (details, message) => app.log.warn(details, message) },
  });

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
      household: householdClients(config, fetch),
    },
    playback: { idleMs: config.playIdleMinutes * 60_000 },
    lyrics,
    // Each medium's item registers its steps here; until then nothing can be requested.
    requests: {
      steps: stepsRegistry(deps.steps ?? []),
      everyMs: config.requests.everySeconds * 1_000,
      notIndexedAfterMs: config.requests.notIndexedAfterHours * 3_600_000,
      stepTimeoutMs: config.requests.stepTimeoutSeconds * 1_000,
      stallAfterMs: config.requests.stallAfterMinutes * 60_000,
      holdAfterMs: config.requests.holdAfterMinutes * 60_000,
    },
    logger: deps.logger ?? true,
  });

  if (!hasAdmin(db)) {
    issueSetupCode(db, setupCodeFile);
    app.log.info(`No admin yet: the one-time setup code is in ${setupCodeFile}`);
  }

  const stopIndexJob = startIndexJob(config, { db, fetch, log: app.log });
  const stopLyricsJob = startLyricsJob(config, { db, fetch, lyrics, log: app.log });

  return {
    app,
    async close() {
      await app.close();
      stopSessionSweep();
      stopIndexJob();
      stopLyricsJob();
      db.close();
      app.log.info('Database closed');
    },
  };
}
