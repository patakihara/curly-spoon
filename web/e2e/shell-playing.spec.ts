import { expect, test, type Page } from '@playwright/test';
import { type Recorded, serveRecorded } from './recorded';
import {
  advances,
  audios,
  episodeTitleIn,
  goWithin,
  keyOf,
  pageOf,
  progressOf as progressAt,
  seekBar,
  signIn as signInAt,
  songsIn,
  titleIn as titleAt,
  titlePlaying,
} from './shell-steps';

/**
 * What the web shell offers and does around playing, on the server with recorded upstreams
 * (M1.shell): Play or Resume as the item stands, Browse's shelf of what you are part way through,
 * a play that cannot be planned, Play next mid-book, Now Playing with nothing loaded, and the
 * queue page's plays. The recordings' four-file book is timed by 5 s stand-in tones, a chapter to
 * a file. Its own server, so its sign-ins count against their own rate limit.
 */

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

let recorded: Recorded;
test.beforeAll(async () => {
  test.setTimeout(120_000);
  recorded = await serveRecorded();
});
test.afterAll(() => recorded?.stop());

const signIn = (page: Page, path: string) => signInAt(page, recorded.origin, path);
const titleIn = (page: Page, medium: string, ref: { source: string; id: string }) =>
  titleAt(page, recorded.origin, medium, ref);
const progressOf = (page: Page, ref: { source: string; id: string }) =>
  progressAt(page, recorded.origin, ref);
const songsOf = (page: Page) => songsIn(page, recorded);
const episodeTitle = (page: Page) => episodeTitleIn(page, recorded);

test.describe('[M1.shell/b] what each page offers, from what the server says', () => {
  test('offers Play on an item not begun, and Resume on one part way through', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, `/podcasts/episodes/${keyOf(recorded.episode)}`);
    expect(await progressOf(page, recorded.episode)).toBeNull();
    await expect(page.getByRole('button', { name: /^play_arrow\s*Play$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Resume$/ })).toHaveCount(0);

    await goWithin(page, `/books/${keyOf(recorded.multiFile)}`);
    expect(await progressOf(page, recorded.multiFile)).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: /^play_arrow\s*Resume$/ })).toBeVisible();
  });

  test("leaves Browse's shelf of what you are part way through out while there is none", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, '/');
    await expect(page.getByText('Jump back in', { exact: true })).toBeVisible();

    // The same lists with nothing begun.
    await page.route('**/api/library/*', async (route) => {
      const listed = await route.fetch();
      const body = (await listed.json()) as { items: { progress: number | null }[] };
      body.items.forEach((item) => (item.progress = null));
      await route.fulfill({ response: listed, json: body });
    });
    const lists = ['books', 'podcasts', 'music'].map((medium) =>
      page.waitForResponse(`${recorded.origin}/api/library/${medium}`),
    );
    await page.reload();
    await Promise.all(lists);
    await expect(page.getByText('Recently added', { exact: true })).toBeVisible();
    await expect(page.getByText('Jump back in', { exact: true })).toHaveCount(0);
    await page.unrouteAll({ behavior: 'wait' });
  });

  test('keeps what plays, playing, when another item cannot be planned', async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, `/podcasts/episodes/${keyOf(recorded.episode)}`);
    const book = await titleIn(page, 'books', recorded.multiFile);
    await goWithin(page, `/books/${keyOf(recorded.multiFile)}`);
    await page.getByRole('button', { name: /Resume$/ }).click();
    await advances(page);

    // The episode's plan fails upstream.
    await page.route('**/api/play', async (route) => {
      const asked = route.request().postDataJSON() as { ref: { id: string } };
      if (asked.ref.id === recorded.episode.id) await route.fulfill({ status: 502, json: {} });
      else await route.fallback();
    });
    await page.goBack();
    await page.getByRole('button', { name: /^play_arrow\s*Play$/ }).click();
    await expect(page.getByRole('button', { name: `Open player, ${book}` })).toBeVisible();
    await expect.poll(() => titlePlaying(page)).toBe(book);
    await advances(page);
  });
});

test.describe('[M1.shell/c] Now Playing and the queue, around what plays', () => {
  test('Play next during a book lets the chapter playing finish before the item put next', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, `/podcasts/episodes/${keyOf(recorded.episode)}`);
    const book = await titleIn(page, 'books', recorded.multiFile);
    const episode = await episodeTitle(page);
    await goWithin(page, `/books/${keyOf(recorded.multiFile)}`);
    await page.getByRole('button', { name: /Resume$/ }).click();
    await expect.poll(() => titlePlaying(page)).toBe(book);
    // Back to the start: the server hears it there, in the first chapter.
    await seekBar(page).press('Home');
    // Into the second chapter, the second 5 s file, before the next 10 s report.
    const inSecond = async () =>
      (await audios(page)).some((a) => !a.paused && /\/tracks\/1$/.test(a.src) && a.time > 0.5);
    await expect.poll(inSecond, { timeout: 15_000 }).toBe(true);

    await page.goBack();
    await page.getByRole('button', { name: /Play next$/ }).click();
    // The second chapter plays on, and only once it ends does the episode.
    const from = (await audios(page)).find((a) => /\/tracks\/1$/.test(a.src))!.time;
    await expect
      .poll(async () => (await audios(page)).find((a) => /\/tracks\/1$/.test(a.src))?.time ?? 0)
      .toBeGreaterThan(from + 1.5);
    expect(await titlePlaying(page)).toBe(book);
    await expect.poll(() => titlePlaying(page), { timeout: 15_000 }).toBe(episode);
  });

  test('leaves Now Playing for Browse when it is opened with nothing loaded', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, '/');
    await page.goto(`${recorded.origin}/playing`);
    await expect(page).toHaveURL(`${recorded.origin}/`);
    await expect(page.getByText('Jump back in', { exact: true })).toBeVisible();
  });

  test('leaves Now Playing for the page that opened it once the item ends with nothing after it', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, `/books/${keyOf(recorded.multiFile)}`);
    await page.getByRole('button', { name: /Resume$/ }).click();
    await advances(page);
    await page.getByRole('button', { name: /^Open player, / }).click();
    await expect(page).toHaveURL(`${recorded.origin}/playing`);
    // To the end of the book: nothing is queued after it.
    await seekBar(page).press('End');
    await expect(page).toHaveURL(pageOf('/books/', recorded.multiFile), { timeout: 15_000 });
    await expect(page.getByRole('button', { name: /^Open player, / })).toHaveCount(0);
  });

  test("lists on the queue page only the shown queue's own plays", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, `/music/albums/${keyOf(recorded.album)}`);
    const [song] = await songsOf(page);
    await page
      .getByRole('button', { name: /^play_arrow\s*Play$/ })
      .first()
      .click();
    await expect.poll(() => titlePlaying(page)).toBe(song);
    // Next: the first song is played, on the music queue.
    await page.getByRole('button', { name: 'Next', exact: true }).first().click();
    await expect.poll(() => titlePlaying(page)).not.toBe(song);

    await goWithin(page, `/podcasts/episodes/${keyOf(recorded.episode)}`);
    await page.getByRole('button', { name: /^play_arrow\s*Play$/ }).click();
    await expect.poll(() => titlePlaying(page)).toBe(await episodeTitle(page));
    // The server lists the session's plays on either queue: the song among the spoken queue's.
    const spoken = await page.request.get(`${recorded.origin}/api/queues/spoken`);
    const { played } = (await spoken.json()) as { played: { queue: string; title: string }[] };
    expect(played).toContainEqual(expect.objectContaining({ queue: 'music', title: song }));

    await page.getByRole('button', { name: 'Queue', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Queue', selected: true })).toBeVisible();
    await expect(page.getByText('Spoken queue', { exact: true })).toBeVisible();
    await expect(page.getByText(song!, { exact: true })).toHaveCount(0);
  });
});
