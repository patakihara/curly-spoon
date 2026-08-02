/**
 * Builds an `AbsClient` for a request: an unauthenticated one for the setup probe,
 * or one bound to a signed-in user's stored (decrypted) upstream token. Kept as a
 * small factory rather than a global singleton so tests can swap in the fake fetch
 * and an in-memory DB without touching module state.
 */

import { AbsClient, type FetchLike } from '@auralis/abs-client';
import type { Db } from './db/connection.js';
import { getSettings } from './db/settingsRepo.js';
import { getUpstreamToken } from './db/secretsRepo.js';

/** The instance has no `settings` row yet — `/setup` hasn't been completed. */
export class NotConfiguredError extends Error {
  constructor() {
    super('Audiobookshelf connection has not been configured yet — run /setup first');
    this.name = 'NotConfiguredError';
  }
}

/** Settings exist, but this particular user has no stored upstream credential. */
export class NoCredentialsError extends Error {
  constructor() {
    super('No stored Audiobookshelf credentials for this user — sign in again');
    this.name = 'NoCredentialsError';
  }
}

export interface AbsUpstreamFactory {
  /** Unauthenticated client for the setup reachability probe, against a candidate URL. */
  forSetup(baseUrl: string): AbsClient;
  /** Authenticated client for `userId`, using the shared settings and that user's stored token. */
  forUser(userId: string): AbsClient;
}

export interface AbsUpstreamFactoryDeps {
  db: Db;
  sessionSecret: string;
  fetch: FetchLike;
  timeoutMs?: number;
  maxRetries?: number;
  /** Lowered in tests (testSupport/buildTestApp.ts) so retry-path tests stay fast. */
  retryBaseDelayMs?: number;
}

export function createAbsUpstreamFactory(deps: AbsUpstreamFactoryDeps): AbsUpstreamFactory {
  return {
    forSetup(baseUrl) {
      return new AbsClient({
        baseUrl,
        fetch: deps.fetch,
        timeoutMs: deps.timeoutMs,
        maxRetries: deps.maxRetries,
        retryBaseDelayMs: deps.retryBaseDelayMs,
      });
    },

    forUser(userId) {
      const settings = getSettings(deps.db);
      if (!settings) throw new NotConfiguredError();

      const token = getUpstreamToken(deps.db, userId, deps.sessionSecret);
      if (!token) throw new NoCredentialsError();

      return new AbsClient({
        baseUrl: settings.baseUrl,
        token,
        fetch: deps.fetch,
        timeoutMs: deps.timeoutMs,
        maxRetries: deps.maxRetries,
        retryBaseDelayMs: deps.retryBaseDelayMs,
      });
    },
  };
}
