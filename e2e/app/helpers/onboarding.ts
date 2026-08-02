/**
 * Drives the onboarding UI to a signed-in, configured state. Every value here
 * must match `apps/server/test/fakes/fakeAbs.ts` (the fake Audiobookshelf the
 * `app` project's `webServer` boots against, via `AURALIS_FAKE_UPSTREAMS=1`) —
 * not imported directly, since `e2e/` has no workspace dependency on
 * `apps/server` (see the "do not touch" boundaries in the Phase 4 spec).
 *
 * Setup (`POST /api/v1/setup`) is idempotent and a failed attempt is never
 * persisted (apps/server/src/routes/setup.ts), so calling this repeatedly
 * across parallel tests against the one shared `webServer` instance is safe:
 * every test gets its own signed-in *session* (a fresh browser context has its
 * own cookies), even though "which Audiobookshelf" is shared, single-tenant
 * server state, same as a real deployment.
 */
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const FAKE_BASE_URL = 'http://fake.abs.local';
export const FAKE_USERNAME = 'kara';
export const FAKE_PASSWORD = 'hunter2';

/** Runs the full 3-step onboarding flow, ending on Home, signed in. */
export async function completeOnboarding(page: Page): Promise<void> {
  await page.goto('/setup');
  await page.getByTestId('setup-base-url-input').fill(FAKE_BASE_URL);
  await page.getByTestId('setup-submit').click();

  await expect(page).toHaveURL(/\/login$/);
  await page.getByTestId('login-username-input').fill(FAKE_USERNAME);
  await page.getByTestId('login-password-input').fill(FAKE_PASSWORD);
  await page.getByTestId('login-submit').click();

  await expect(page).toHaveURL(/\/setup\/services$/);
  await page.getByTestId('services-skip').click();

  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('home-page')).toBeVisible();
}
