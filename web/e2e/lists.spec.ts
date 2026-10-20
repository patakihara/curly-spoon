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

/** The recorded show's episodes, in the show's order. */
async function showEpisodes(page: Page) {
  const show = await page.request.get(`${recorded.origin}/api/items/${keyOf(recorded.show)}`);
  return (
    (await show.json()) as {
      episodes: { ref: { source: string; id: string }; title: string; finished: boolean }[];
    }
  ).episodes;
}

/** The spoken queue's items, from what is current on, as their refs' keys. */
async function spokenQueue(page: Page) {
  const queue = await page.request.get(`${recorded.origin}/api/queues/spoken`);
  const { current, user } = (await queue.json()) as {
    current: { ref: { source: string; id: string } } | null;
    user: { ref: { source: string; id: string } }[];
  };
  return [current, ...user].flatMap((item) => (item === null ? [] : [keyOf(item.ref)]));
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

  test('draws a playlist of several episodes in the order picked, and plays it in that order', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, '/');
    const episodes = (await showEpisodes(page)).filter((e) => !e.finished);
    const others = episodes.filter((e) => keyOf(e.ref) !== keyOf(recorded.episode)).slice(0, 2);
    expect(others).toHaveLength(2);
    // The recorded episode first, so it plays; the others in the opposite of the show's order.
    const picked = [
      episodes.find((e) => keyOf(e.ref) === keyOf(recorded.episode))!,
      ...others.reverse(),
    ];
    const made = await page.request.post(`${recorded.origin}/api/lists`, {
      headers: { origin: recorded.origin },
      data: { kind: 'playlist', name: 'Order test' },
    });
    const { id } = (await made.json()) as { id: string };
    const put = await page.request.put(`${recorded.origin}/api/lists/${id}/items`, {
      headers: { origin: recorded.origin },
      data: { refs: picked.map((e) => e.ref) },
    });
    expect(put.status()).toBe(200);

    await goWithin(page, `/lists/${id}`);
    await expect(page.getByText('3 episodes', { exact: true })).toBeVisible();
    // The page's episode rows, top to bottom, each by the picked episode it names.
    await expect(page.getByRole('button', { name: 'Play episode', exact: true })).toHaveCount(3);
    const rows = await page
      .getByRole('button', { name: 'Play episode', exact: true })
      .evaluateAll((plays) =>
        plays.map((play) => play.parentElement?.closest('[role="button"]')?.textContent ?? ''),
      );
    expect(rows.map((row) => picked.findIndex((e) => row.includes(e.title)))).toEqual([0, 1, 2]);

    await page.getByRole('button', { name: /^play_arrow\s*Play$/ }).click();
    await expect.poll(() => spokenQueue(page)).toEqual(picked.map((e) => keyOf(e.ref)));
    await advances(page);
    await expect.poll(() => titlePlaying(page)).toBe(picked[0]!.title);
  });

  test("makes a playlist from an episode's menu, then renames and deletes it from its own", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, '/');
    const title = await episodeTitleIn(page, recorded);
    const answers = ['Menu test', 'Renamed test'];
    page.on(
      'dialog',
      (dialog) =>
        void (dialog.type() === 'prompt' ? dialog.accept(answers.shift()) : dialog.accept()),
    );
    const menu = () => page.getByRole('button', { name: 'More options', exact: true }).first();
    const verb = (label: string) => page.getByRole('menuitem').filter({ hasText: label });

    await goWithin(page, `/podcasts/episodes/${keyOf(recorded.episode)}`);
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
    await expect(menu()).toBeEnabled();
    await menu().click();
    await verb('New playlist').click();
    await expect(page).toHaveURL(new RegExp(`${recorded.origin}/lists/[^/]+$`));
    const id = new URL(page.url()).pathname.split('/').at(-1)!;
    await expect(page.getByText('Menu test', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(title, { exact: true })).toBeVisible();

    await menu().click();
    await verb('Rename').click();
    await expect(page.getByText('Renamed test', { exact: true }).first()).toBeVisible();
    const renamed = await page.request.get(`${recorded.origin}/api/lists/${id}`);
    expect(((await renamed.json()) as { name: string }).name).toBe('Renamed test');

    await menu().click();
    await verb('Delete playlist').click();
    await expect(page).toHaveURL(`${recorded.origin}/podcasts`);
    expect((await page.request.get(`${recorded.origin}/api/lists/${id}`)).status()).toBe(404);
  });
});
