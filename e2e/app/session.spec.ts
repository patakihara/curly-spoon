/**
 * Signing in, failing to sign in, and losing a session mid-use.
 *
 * The server is already configured by the time this file runs (see
 * `onboarding.spec.ts` and the project dependency in `playwright.config.ts`), so
 * these are the credential and session cases specifically, not first-run setup.
 *
 * This is the one file that discards the project's shared `storageState`: it
 * drives the login form itself, so it has to start signed out. Two consequences
 * worth stating, because both would otherwise be found the hard way:
 *
 * - Nothing here may sign the *shared* session out. Logout invalidates the
 *   cookie server-side and every other spec in the project is holding it, so the
 *   sign-out test builds a session of its own first.
 * - Each test performs a real `POST /auth/login`, which is rate limited to 10
 *   per minute per IP (all Playwright workers share one). Five here plus
 *   onboarding's one leaves headroom for a retry. Keep it that way — and note
 *   that making this file serial would make it *worse*, since a serial file
 *   re-runs from the top on retry rather than re-running the one failure.
 */
import { expect, test, type Page } from '@playwright/test';
import { FAKE_PASSWORD, FAKE_USERNAME } from './helpers/onboarding.js';

test.use({ storageState: { cookies: [], origins: [] } });

async function signIn(page: Page, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-username-input').fill(FAKE_USERNAME);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-submit').click();
}

test('a wrong password says so, and leaves you on the form to try again', async ({ page }) => {
  await signIn(page, 'not-the-password');

  const error = page.getByTestId('login-error');
  await expect(error).toBeVisible();
  await expect(error).toHaveText('Incorrect username or password.');
  await expect(page).toHaveURL(/\/login$/);

  // LoginPage clears the password from state on failure, so a failed attempt
  // never leaves a credential sitting in the DOM for the next person at the
  // machine to read out of devtools.
  await expect(page.getByTestId('login-password-input')).toHaveValue('');

  // And the form still works — the failure is a message, not a dead end.
  await page.getByTestId('login-password-input').fill(FAKE_PASSWORD);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/setup\/services$/);
});

test('an unknown username is not distinguished from a wrong password', async ({ page }) => {
  // Deliberate: naming which half was wrong tells an attacker which usernames
  // exist on the server. Both collapse to the same 401 `invalid_credentials`.
  await page.goto('/login');
  await page.getByTestId('login-username-input').fill('nobody-by-that-name');
  await page.getByTestId('login-password-input').fill(FAKE_PASSWORD);
  await page.getByTestId('login-submit').click();

  await expect(page.getByTestId('login-error')).toHaveText('Incorrect username or password.');
});

test('an expired session sends you to sign in rather than a broken page', async ({
  page,
  context,
}) => {
  await signIn(page, FAKE_PASSWORD);
  await expect(page).toHaveURL(/\/setup\/services$/);
  await page.goto('/library/lib-books');
  await expect(page.getByTestId('library-item-cards')).toBeVisible();

  // What expiry looks like from the browser's side. The next authenticated call
  // 401s, and the global handler in `apps/web/src/api/queryClient.ts` is what
  // turns that into a redirect rather than a page of half-loaded panels.
  await context.clearCookies();
  await page.goto('/library/lib-books');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('login-form')).toBeVisible();
});

test('signing out ends the session on the server, not just in this tab', async ({ page }) => {
  await signIn(page, FAKE_PASSWORD);
  await expect(page).toHaveURL(/\/setup\/services$/);
  await page.goto('/settings');
  await page.getByTestId('sign-out').click();

  await expect(page).toHaveURL(/\/login$/);

  // Going somewhere authenticated must not resurrect the old session from a
  // stale react-query cache: `useLogoutMutation` clears the client, and the
  // session row is gone server-side, so this bounces back to login.
  await page.goto('/library/lib-books');
  await expect(page).toHaveURL(/\/login$/);

  // Setup is *server* state and survives a sign-out — signing out of Auralis
  // must never look like "your server configuration was lost".
  await expect(page).not.toHaveURL(/\/setup$/);
  await page.goto('/setup');
  await expect(page.getByTestId('setup-base-url-input')).toBeVisible();
});
