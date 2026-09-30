import { expect, test } from '@playwright/test';
import { type Recorded, serveRecorded } from './recorded';

/**
 * Sign in leaves the app for the server's login route, as the web client, coming back to where
 * the visitor was going: the browser goes there itself, since the route answers with a redirect
 * to the household sign-on rather than a page the app draws.
 */
test("Sign in sends the browser to the server's web sign-in, coming back where it was going", async ({
  page,
}) => {
  for (const [at, back] of [
    ['/sign-in?return_to=%2Fbooks%3Fsort%3Dnew', '/books?sort=new'],
    ['/sign-in', '/'],
  ] as const) {
    await page.goto(at);
    const [request] = await Promise.all([
      page.waitForRequest((r) => new URL(r.url()).pathname === '/api/auth/login'),
      page.getByRole('button', { name: 'Sign in', exact: true }).click(),
    ]);
    expect(request.isNavigationRequest()).toBe(true);
    const query = new URL(request.url()).searchParams;
    expect(Object.fromEntries(query)).toEqual({ client: 'web', return_to: back });
  }
});

/** What the sign-in page says when the household sign-on refuses, and never otherwise. */
const REFUSED = 'The household sign-in said no';

test.describe('[M0.sso/d] signing in on a server with a sign-on', () => {
  let recorded: Recorded;
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    recorded = await serveRecorded();
  });
  test.afterAll(() => recorded?.stop());

  test('a signed-out visitor is sent to sign in, then arrives where they were going', async ({
    page,
  }) => {
    const { origin } = recorded;
    await page.goto(`${origin}/books?sort=new`);
    await expect(page).toHaveURL(`${origin}/sign-in?return_to=%2Fbooks%3Fsort%3Dnew`);
    await expect(page.getByText('Sign in with your household account')).toBeVisible();
    await expect(page.getByText(REFUSED)).toHaveCount(0);
    await expect(page.getByText("isn't one of the household's")).toHaveCount(0);

    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(`${origin}/books?sort=new`);
    await expect(
      page.getByText('Books', { exact: true }).locator('visible=true').first(),
    ).toBeVisible();
  });

  test('a refused sign-in comes back to sign in saying why, and trying again gets through', async ({
    page,
  }) => {
    const { origin } = recorded;
    // The sign-on says no: the browser comes back from it with an error, not a code. The route
    // starting sign-in is answered as the server answers it, but sent back at once with its state.
    const LOGIN = `${origin}/api/auth/login**`;
    await page.route(LOGIN, async (route) => {
      const started = await route.fetch({ maxRedirects: 0 });
      const state = new URL(started.headers()['location']!).searchParams.get('state') ?? '';
      const back = new URL('/api/auth/callback', origin);
      back.search = new URLSearchParams({ state, error: 'access_denied' }).toString();
      await route.fulfill({
        response: started,
        headers: { ...started.headers(), location: back.toString() },
      });
    });
    await page.goto(`${origin}/music`);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(`${origin}/sign-in?error=sign_on_refused&return_to=%2Fmusic`);
    await expect(page.getByText(REFUSED)).toBeVisible();

    await page.unroute(LOGIN);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(`${origin}/music`);
  });
});
