import { expect, test, type Page } from '@playwright/test';
import { type Recorded, serveRecorded } from './recorded';
import {
  advances,
  episodeTitleIn,
  goWithin,
  keyOf,
  signIn as signInAt,
  titlePlaying,
} from './shell-steps';

/**
 * Lists in the web shell, on the server with recorded upstreams (M2.lists, for M2.exit): a
 * playlist made through the API shows on the Podcasts page, opens its own page, and plays from
 * there through `POST /api/lists/{id}/play`. The recordings' episodes are years old, so The Digest
 * is empty here; its rule is covered by the server's suites, on an injected clock. Its own server,
 * so its sign-ins count against their own rate limit.
 */

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

let recorded: Recorded;
test.beforeAll(async () => {
  test.setTimeout(120_000);
  recorded = await serveRecorded();
});
test.afterAll(() => recorded?.stop());

const signIn = (page: Page, path: string) => signInAt(page, recorded.origin, path);

/** Makes a playlist named `name` holding the recorded episode, and answers its id. */
async function playlistOf(page: Page, name: string): Promise<string> {
  const made = await page.request.post(`${recorded.origin}/api/lists`, {
    headers: { origin: recorded.origin },
    data: { kind: 'playlist', name },
  });
  expect(made.status()).toBe(200);
  const { id } = (await made.json()) as { id: string };
  const added = await page.request.post(`${recorded.origin}/api/lists/${id}/items`, {
    headers: { origin: recorded.origin },
    data: { ref: recorded.episode },
  });
  expect(added.status()).toBe(200);
  return id;
}

test.describe('[M2.lists] a playlist in the shell', () => {
  test('shows on the Podcasts page, opens its page, and plays its first episode from there', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, '/');
    const id = await playlistOf(page, 'Commute test');
    const title = await episodeTitleIn(page, recorded);

    await goWithin(page, '/podcasts');
    await expect(page.getByText('The Digest', { exact: true })).toBeVisible();
    await page.getByText('Commute test', { exact: true }).click();
    await expect(page).toHaveURL(`${recorded.origin}/lists/${id}`);
    await expect(page.getByText('Playlist', { exact: true })).toBeVisible();
    await expect(page.getByText(title, { exact: true })).toBeVisible();

    const played = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url() === `${recorded.origin}/api/lists/${id}/play`,
    );
    await page.getByRole('button', { name: /^play_arrow\s*Play$/ }).click();
    await played;
    await advances(page);
    await expect.poll(() => titlePlaying(page)).toBe(title);

    const queue = await page.request.get(`${recorded.origin}/api/queues/spoken`);
    const { current, context } = (await queue.json()) as {
      current: { ref: { source: string; id: string } } | null;
      context: unknown;
    };
    expect(current && keyOf(current.ref)).toBe(keyOf(recorded.episode));
    expect(context).toBeNull();
  });

  test("plays an episode from the list's own row through the list", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, '/');
    const id = await playlistOf(page, 'Row test');
    const title = await episodeTitleIn(page, recorded);

    await goWithin(page, `/lists/${id}`);
    const played = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url() === `${recorded.origin}/api/lists/${id}/play`,
    );
    const row = page.getByText(title, { exact: true });
    await row.hover();
    await row
      .locator('xpath=ancestor::*[.//*[@aria-label="Play episode"]][1]')
      .getByRole('button', { name: 'Play episode', exact: true })
      .click();
    const body = (await played).postDataJSON() as { start?: unknown };
    expect(body.start).toEqual(recorded.episode);
    await advances(page);
    await expect.poll(() => titlePlaying(page)).toBe(title);
  });
});
