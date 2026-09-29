import { expect, test } from '@playwright/test';

/**
 * Sign in leaves the app for the server's login route, as the web client, coming back to the
 * app's start: the browser goes there itself, since the route answers with a redirect to the
 * household sign-on rather than a page the app draws.
 */
test("Sign in sends the browser to the server's web sign-in", async ({ page }) => {
  await page.goto('/sign-in');
  const [request] = await Promise.all([
    page.waitForRequest((r) => new URL(r.url()).pathname === '/api/auth/login'),
    page.getByRole('button', { name: 'Sign in', exact: true }).click(),
  ]);
  expect(request.isNavigationRequest()).toBe(true);
  const query = new URL(request.url()).searchParams;
  expect(Object.fromEntries(query)).toEqual({ client: 'web', return_to: '/' });
});
