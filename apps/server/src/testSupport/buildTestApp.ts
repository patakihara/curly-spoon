/**
 * Test-only wiring: an in-memory DB plus the fixture-backed fake Audiobookshelf,
 * assembled through the exact same `buildServer` factory the real app uses. Route
 * tests drive everything through `app.inject()` — no port is ever bound.
 */

import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../app.js';
import type { AppConfig } from '../config.js';
import { openDatabase } from '../db/connection.js';
import { setSettings } from '../db/settingsRepo.js';
import {
  createFakeAbsUpstream,
  FAKE_BASE_URL,
  FAKE_CREDENTIALS,
  type FakeAbsUpstream,
} from '../../test/fakes/fakeAbs.js';

export interface TestAppContext {
  app: FastifyInstance;
  fake: FakeAbsUpstream;
  sessionSecret: string;
}

export function buildTestApp(options: { configured?: boolean } = {}): TestAppContext {
  const db = openDatabase(':memory:');
  const sessionSecret = randomBytes(32).toString('hex');
  const fake = createFakeAbsUpstream();

  const config: AppConfig = {
    port: 0,
    dataDir: ':memory:',
    sessionSecret,
    fakeUpstreams: true,
    nodeEnv: 'test',
    // Route tests exercise `/api/v1/**` only and must not depend on whether
    // `apps/web/dist` happens to exist on the machine running them — see
    // static.ts for the real (default-on) behaviour.
    serveWeb: false,
  };

  if (options.configured !== false) {
    setSettings(db, FAKE_BASE_URL);
  }

  const app = buildServer({ db, config, fetch: fake.fetch, logger: false, absRetryBaseDelayMs: 1 });
  return { app, fake, sessionSecret };
}

/** Logs in the seeded fake user and returns the raw session cookie value. */
export async function loginTestUser(app: FastifyInstance): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: FAKE_CREDENTIALS,
  });

  const setCookieHeader = response.headers['set-cookie'];
  const cookieHeader = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!cookieHeader) {
    throw new Error(`test login failed: ${response.statusCode} ${response.body}`);
  }

  const match = /auralis_session=([^;]+)/.exec(cookieHeader);
  if (!match?.[1]) throw new Error('login response carried no session cookie');
  return match[1];
}
