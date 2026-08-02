/**
 * Shared constants for the `app` Playwright projects.
 *
 * Every value here must match `apps/server/src/testSupport/fakes/fakeAbs.ts`
 * (the fake Audiobookshelf the `app` project's `webServer` boots against, via
 * `AURALIS_FAKE_UPSTREAMS=1`) — not imported directly, since `e2e/` has no
 * workspace dependency on `apps/server`.
 *
 * Note what is *not* here any more: a `completeOnboarding` helper that each test
 * called. `POST /api/v1/auth/login` is rate limited to 10 attempts per minute
 * per IP (apps/server/src/app.ts), and every Playwright worker shares one IP, so
 * signing in once per test 429s partway through a suite this size. Instead
 * `onboarding.spec.ts` signs in once and writes `AUTH_STATE_PATH`, which the
 * `app` project loads as `storageState` — the standard Playwright pattern, and
 * much faster besides. Specs that genuinely need to be signed *out* opt back out
 * with `test.use({ storageState: { cookies: [], origins: [] } })`.
 */
import { fileURLToPath } from 'node:url';

export const FAKE_BASE_URL = 'http://fake.abs.local';
export const FAKE_USERNAME = 'kara';
export const FAKE_PASSWORD = 'hunter2';

/** Where the signed-in browser state is handed from `app-onboarding` to `app`. Gitignored. */
export const AUTH_STATE_PATH = fileURLToPath(new URL('../../.auth/app-user.json', import.meta.url));
