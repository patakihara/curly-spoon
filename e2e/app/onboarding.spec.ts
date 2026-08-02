/**
 * First-run onboarding, against a server nothing has configured yet.
 *
 * This file is its own Playwright project (`app-onboarding`) that every other
 * `app` spec depends on — see the comment on that project in
 * `playwright.config.ts`. The reason is entirely about shared state: the BFF is
 * single-tenant, so `POST /api/v1/setup` configures it for the whole process,
 * and the third test here is what performs that write. Anything asserting on the
 * *unconfigured* state must therefore live in this file, above that test, and
 * the file must be serial.
 */
import { expect, test } from '@playwright/test';
import {
  AUTH_STATE_PATH,
  FAKE_BASE_URL,
  FAKE_PASSWORD,
  FAKE_USERNAME,
} from './helpers/onboarding.js';

test.describe.configure({ mode: 'serial' });

test('an unconfigured server sends you to setup, wherever you tried to go', async ({ page }) => {
  await page.goto('/library/lib-books');

  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByTestId('onboarding-card')).toBeVisible();
  await expect(page.getByTestId('onboarding-step')).toHaveText('Step 1 of 3');
  // Onboarding gets the bare layout, not the app shell: there is nothing to
  // navigate to yet, so offering navigation would be offering dead ends.
  await expect(page.getByTestId('bare-shell')).toBeVisible();
  await expect(page.getByTestId('nav-rail-expanded')).toHaveCount(0);
});

test('an address that does not resolve is diagnosed as that, and is never saved', async ({
  page,
}) => {
  await page.goto('/setup');
  await page.getByTestId('setup-base-url-input').fill('http://audiobookshelf.invalid');
  await page.getByTestId('setup-submit').click();

  // The specific diagnosis, not a generic "could not connect" — the whole point
  // of `apps/web/src/api/setupErrors.ts`. A user who typo'd a hostname is told
  // it is the hostname.
  const error = page.getByTestId('setup-error');
  await expect(error).toBeVisible();
  await expect(error).toContainText("Can't find that server");
  await expect(error).toContainText('resolve that hostname');
  await expect(page).toHaveURL(/\/setup$/);

  // A failed probe must not overwrite (or, here, create) configuration —
  // apps/server/src/routes/setup.ts only persists after `probe()` succeeds. If
  // it had been saved, this reload would land on Home instead.
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
});

test('connecting, signing in and skipping the extras lands on a working Home', async ({ page }) => {
  await page.goto('/setup');
  await page.getByTestId('setup-base-url-input').fill(FAKE_BASE_URL);
  await page.getByTestId('setup-submit').click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('onboarding-step')).toHaveText('Step 2 of 3');

  await page.getByTestId('login-username-input').fill(FAKE_USERNAME);
  await page.getByTestId('login-password-input').fill(FAKE_PASSWORD);
  await page.getByTestId('login-submit').click();

  await expect(page).toHaveURL(/\/setup\/services$/);
  await expect(page.getByTestId('onboarding-step')).toHaveText('Step 3 of 3');
  // Step 3 is optional by design; skipping it must reach a usable app, not a
  // half-configured one.
  await page.getByTestId('services-skip').click();

  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('home-page')).toBeVisible();
  // Home is only meaningfully "working" if the libraries call behind it
  // succeeded, which is what puts real cards on the page.
  await expect(page.getByTestId('library-card-lib-books')).toBeVisible();
  await expect(page.getByTestId('library-card-lib-podcasts')).toBeVisible();

  // Hand the resulting signed-in cookie to the rest of the suite (the `app`
  // project's `storageState`). This is here rather than in a fourth test
  // because it costs a login, and `POST /auth/login` is rate limited to 10 per
  // minute per IP — every Playwright worker shares one IP, so a suite that
  // signed in once per test would 429 partway through and fail in a way that
  // looks like a credential bug.
  await page.context().storageState({ path: AUTH_STATE_PATH });
});

test('a second browser is asked to sign in, not to set the server up again', async ({
  browser,
}) => {
  // Setup is *server* state and stays done once; the session cookie is
  // per-browser. So a device that has never seen this Auralis skips straight to
  // step 2 rather than being asked which Audiobookshelf it is — which is what
  // makes this a household app rather than a single-browser one.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('login-form')).toBeVisible();
  await context.close();
});
