/**
 * Builds a `JellyfinClient` for a request: an unauthenticated one for the login probe
 * (Jellyfin has no separate "setup" step the way Audiobookshelf does — `POST
 * /jellyfin/login` configures and authenticates in one call, see routes/jellyfin.ts),
 * or one bound to a signed-in Auralis user's stored (decrypted) Jellyfin access token.
 * Structurally a sibling of `absUpstream.ts`'s `AbsUpstreamFactory` — same shape, same
 * reasoning for existing as a small factory rather than a global singleton (tests swap
 * in a fake fetch and an in-memory DB without touching module state).
 *
 * Jellyfin authenticates per account (`POST /Users/AuthenticateByName`, same shape as
 * Audiobookshelf's own login), so — unlike a Prowlarr API key, which belongs to the
 * installation — the token is scoped to whichever Auralis user connected it. See
 * `db/jellyfinSecretsRepo.ts`'s file comment for the full reasoning on why that lives in
 * its own table rather than `secrets` or `provider_configs`.
 */

import { JellyfinClient, type FetchLike, type JellyfinDeviceInfo } from '@auralis/jellyfin-client';
import type { Db } from './db/connection.js';
import { getSettings } from './db/settingsRepo.js';
import { getJellyfinToken } from './db/jellyfinSecretsRepo.js';

/** The `settings.upstream` key Jellyfin's own base URL is stored under — distinct from
 * `settingsRepo.ts`'s `DEFAULT_UPSTREAM` ('audiobookshelf'), so the two connections
 * never collide in the same table. */
export const JELLYFIN_UPSTREAM_KEY = 'jellyfin';

/** Identifies Auralis's own BFF as a single stable "device" to the Jellyfin server —
 * every user's session shows up under this name/id, not a per-browser one, since the
 * BFF (not the browser) is the thing actually calling Jellyfin. `version` mirrors the
 * root `package.json` version; it has no behavioural effect on Jellyfin beyond showing
 * up in its admin dashboard's session list. */
export const AURALIS_JELLYFIN_DEVICE: JellyfinDeviceInfo = {
  client: 'Auralis',
  device: 'Auralis BFF',
  deviceId: 'auralis-bff',
  version: '0.1.0',
};

/** The instance has no `settings` row for `JELLYFIN_UPSTREAM_KEY` yet — nobody has
 * connected a Jellyfin server via `POST /jellyfin/login`. */
export class JellyfinNotConfiguredError extends Error {
  constructor() {
    super('Jellyfin connection has not been configured yet — connect a Jellyfin server first');
    this.name = 'JellyfinNotConfiguredError';
  }
}

/** A Jellyfin server is configured, but this particular user has no stored access token. */
export class JellyfinNoCredentialsError extends Error {
  constructor() {
    super('No stored Jellyfin credentials for this user — sign in to Jellyfin again');
    this.name = 'JellyfinNoCredentialsError';
  }
}

export interface JellyfinUpstreamFactory {
  /** Unauthenticated client for the login call, against a candidate (or the already
   * stored) base URL. */
  forSetup(baseUrl: string): JellyfinClient;
  /** Authenticated client for `userId`, using the shared Jellyfin settings and that
   * user's stored token. */
  forUser(userId: string): JellyfinClient;
}

export interface JellyfinUpstreamFactoryDeps {
  db: Db;
  sessionSecret: string;
  fetch: FetchLike;
  timeoutMs?: number;
  maxRetries?: number;
  /** Lowered in tests (testSupport/buildTestApp.ts) so retry-path tests stay fast. */
  retryBaseDelayMs?: number;
}

export function createJellyfinUpstreamFactory(
  deps: JellyfinUpstreamFactoryDeps,
): JellyfinUpstreamFactory {
  return {
    forSetup(baseUrl) {
      return new JellyfinClient({
        baseUrl,
        fetch: deps.fetch,
        device: AURALIS_JELLYFIN_DEVICE,
        timeoutMs: deps.timeoutMs,
        maxRetries: deps.maxRetries,
        retryBaseDelayMs: deps.retryBaseDelayMs,
      });
    },

    forUser(userId) {
      const settings = getSettings(deps.db, JELLYFIN_UPSTREAM_KEY);
      if (!settings) throw new JellyfinNotConfiguredError();

      const token = getJellyfinToken(deps.db, userId, deps.sessionSecret);
      if (!token) throw new JellyfinNoCredentialsError();

      return new JellyfinClient({
        baseUrl: settings.baseUrl,
        token,
        fetch: deps.fetch,
        device: AURALIS_JELLYFIN_DEVICE,
        timeoutMs: deps.timeoutMs,
        maxRetries: deps.maxRetries,
        retryBaseDelayMs: deps.retryBaseDelayMs,
      });
    },
  };
}
