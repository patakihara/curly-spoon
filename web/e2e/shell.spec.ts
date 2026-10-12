import { expect, test, type Page } from '@playwright/test';
import { type Recorded, serveRecorded } from './recorded';
import {
  advances,
  audios,
  keyOf,
  playedTo,
  signIn as signInAt,
  titleIn as titleAt,
} from './shell-steps';

/**
 * The minimal web shell on the server with recorded upstreams (M1.shell): sign in, open the
 * Books, Podcasts and Music lists, open an item's page and start it playing; Now Playing and the
 * queue page; speed, the sleep timer and the system's media controls; an episode's own page, and
 * an author or artist with no page drawn as plain text. The recordings' four-file book is timed by 5 s stand-in tones, a chapter to a file. What each list and page shows is read
 * from the server's own answers, never written here.
 */

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

let recorded: Recorded;
test.beforeAll(async () => {
  test.setTimeout(120_000);
  recorded = await serveRecorded();
});
test.afterAll(() => recorded?.stop());

/** Signs in from the page `path`, landing back on it. */
const signIn = (page: Page, path: string) => signInAt(page, recorded.origin, path);

/** The title the server gives `ref` in `medium`'s list. */
const titleIn = (page: Page, medium: string, ref: { source: string; id: string }) =>
  titleAt(page, recorded.origin, medium, ref);

/** The address of `ref`'s page under `path`, its ref's colon written as it is or escaped. */
const pageOf = (path: string, ref: { source: string; id: string }) =>
  new RegExp(`${path}${ref.source}(?::|%3A)${ref.id}$`);

/** The album's songs, in order, by the titles the server gives them. */
async function songsOf(page: Page) {
  const album = await page.request.get(`${recorded.origin}/api/items/${keyOf(recorded.album)}`);
  const { tracks } = (await album.json()) as { tracks: { title: string }[] };
  return tracks.map((t) => t.title);
}

/** The title the server gives the show's playing episode. */
async function episodeTitle(page: Page) {
  const show = await page.request.get(`${recorded.origin}/api/items/${keyOf(recorded.show)}`);
  const { episodes } = (await show.json()) as {
    episodes: { ref: { source: string; id: string }; title: string }[];
  };
  return episodes.find((e) => keyOf(e.ref) === keyOf(recorded.episode))!.title;
}

/** What the system's media controls say plays. */
const titlePlaying = (page: Page) =>
  page.evaluate(() => navigator.mediaSession.metadata?.title ?? null);

/** Opens the list at `home` from the shell's own destination, then the card titled `title`. */
async function open(page: Page, destination: string, home: string, title: string) {
  await page
    .getByRole('button', { name: destination, exact: true })
    .and(page.locator(':not([aria-pressed])'))
    .first()
    .click();
  await expect(page).toHaveURL(`${recorded.origin}${home}`);
  await page.getByText(title, { exact: true }).first().click();
}

test.describe('[M1.shell/b] the shell on recorded upstreams', () => {
  test('signs in, opens the Books, Podcasts and Music lists, and starts each playing from its page', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, '/');
    const book = await titleIn(page, 'books', recorded.multiFile);
    const show = await titleIn(page, 'podcasts', recorded.show);
    const album = await titleIn(page, 'music', recorded.album);
    const episode = await episodeTitle(page);

    await open(page, 'Books', '/books', book);
    await expect(page).toHaveURL(pageOf('/books/', recorded.multiFile));
    await page.getByRole('button', { name: /Resume$/ }).click();
    await expect.poll(() => titlePlaying(page)).toBe(book);
    await advances(page);

    await open(page, 'Podcasts', '/podcasts', show);
    await expect(page).toHaveURL(pageOf('/podcasts/', recorded.show));
    await page
      .getByText(episode, { exact: true })
      .locator('xpath=ancestor::*[.//*[@aria-label="Play episode"]][1]')
      .getByRole('button', { name: 'Play episode', exact: true })
      .click();
    await expect.poll(() => titlePlaying(page)).toBe(episode);
    await advances(page);

    await open(page, 'Music', '/music', album);
    await expect(page).toHaveURL(pageOf('/music/albums/', recorded.album));
    await page
      .getByRole('button', { name: /^play_arrow\s*Play$/ })
      .first()
      .click();
    // A song is named by its own title, the album by the album's.
    const [song] = await songsOf(page);
    await expect.poll(() => titlePlaying(page)).toBe(song);
    await expect(page.getByRole('button', { name: `Open player, ${song}` })).toBeVisible();
    await advances(page);
  });

  test("opens an episode's own page from its show, and plays it from there", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, `/podcasts/${keyOf(recorded.show)}`);
    const episode = await episodeTitle(page);
    await page.getByText(episode, { exact: true }).first().click();
    await expect(page).toHaveURL(pageOf('/podcasts/episodes/', recorded.episode));
    await page.getByRole('button', { name: /Resume$/ }).click();
    await expect.poll(() => titlePlaying(page)).toBe(episode);
    await advances(page);
  });

  test('draws an author or artist with no page to open as plain text, never a link', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, `/books/${keyOf(recorded.multiFile)}`);
    const books = await page.request.get(`${recorded.origin}/api/library/books`);
    const { items } = (await books.json()) as {
      items: { ref: { source: string; id: string }; sub: string }[];
    };
    const author = items.find((i) => keyOf(i.ref) === keyOf(recorded.multiFile))!.sub;
    await expect(page.getByText(author, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: author })).toHaveCount(0);

    await page.goto(`${recorded.origin}/music/albums/${keyOf(recorded.album)}`);
    const albums = await page.request.get(`${recorded.origin}/api/library/music`);
    const music = (await albums.json()) as { items: typeof items };
    const artist = music.items.find((i) => keyOf(i.ref) === keyOf(recorded.album))!.sub;
    await expect(page.getByText(artist, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: artist })).toHaveCount(0);
  });

  test('draws no player until something is loaded, then the mini-player and the panel', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, `/books/${keyOf(recorded.multiFile)}`);
    const book = await titleIn(page, 'books', recorded.multiFile);
    await expect(page.getByRole('button', { name: /^Open player, / })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Now playing' })).toHaveCount(0);
    await page.getByRole('button', { name: /Resume$/ }).click();
    await expect(page.getByRole('button', { name: `Open player, ${book}` })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Now playing' })).toBeVisible();
  });
});

test.describe('[M1.shell/c] Now Playing and the queue', () => {
  test("shows Now Playing's position advancing, and the queue page lists what plays next", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, `/books/${keyOf(recorded.multiFile)}`);
    await page.getByRole('button', { name: /Resume$/ }).click();
    await advances(page);

    await page.getByRole('button', { name: /^Open player, / }).click();
    await expect(page).toHaveURL(`${recorded.origin}/playing`);
    // The seek bar's elapsed readout, under its slider.
    const elapsed = page
      .getByRole('slider')
      .locator('xpath=following-sibling::div[1]/span[1]')
      .locator('visible=true')
      .first();
    const seconds = async () => {
      const [m, s] = (await elapsed.innerText()).split(':').map(Number);
      return m! * 60 + s!;
    };
    const from = await seconds();
    await expect.poll(seconds, { timeout: 10_000 }).toBeGreaterThanOrEqual(from + 2);

    // Play next on a second item: the show's episode, next in the spoken queue.
    const episode = await episodeTitle(page);
    const queued = await page.request.post(`${recorded.origin}/api/queues/spoken/items`, {
      headers: { origin: recorded.origin },
      data: { ref: recorded.episode, how: 'next' },
    });
    expect(queued.status()).toBe(200);
    await page.getByRole('tab', { name: 'Queue' }).click();
    await expect(page).toHaveURL(`${recorded.origin}/playing/queue`);
    await expect(page.getByText('Up next', { exact: true })).toBeVisible();
    await expect(page.getByText(episode, { exact: true })).toBeVisible();
  });

  test("lists what plays next in the desktop's side panel too", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, `/books/${keyOf(recorded.multiFile)}`);
    await page.getByRole('button', { name: /Resume$/ }).click();
    await advances(page);
    const episode = await episodeTitle(page);
    const queued = await page.request.post(`${recorded.origin}/api/queues/spoken/items`, {
      headers: { origin: recorded.origin },
      data: { ref: recorded.episode, how: 'next' },
    });
    expect(queued.status()).toBe(200);
    await page.getByRole('button', { name: 'Queue', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Queue', selected: true })).toBeVisible();
    await expect(page.getByText(episode, { exact: true })).toBeVisible();
  });
});

test.describe('[M1.shell/d] speed, the sleep timer and the media controls', () => {
  /** Starts the four-file book from its page, on a desktop, its clock in the test's hands. */
  async function playBook(page: Page) {
    await page.clock.install();
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, `/books/${keyOf(recorded.multiFile)}`);
    await page.getByRole('button', { name: /Resume$/ }).click();
    await expect.poll(() => playedTo(page), { timeout: 15_000 }).toBeGreaterThan(0);
  }

  test('speed changes the playback rate of both of the player’s elements', async ({ page }) => {
    await playBook(page);
    await page.getByRole('button', { name: 'Playback speed, 1 times' }).first().click();
    await page.getByRole('button', { name: 'Playback speed, 1.25 times' }).first().click();
    await expect(
      page.getByRole('button', { name: 'Playback speed, 1.5 times' }).first(),
    ).toBeVisible();
    await expect.poll(async () => (await audios(page)).map((a) => a.rate)).toEqual([1.5, 1.5]);
  });

  test('the sleep timer pauses playback once its time is up', async ({ page }) => {
    await playBook(page);
    await page.getByRole('button', { name: 'Sleep timer, Off' }).first().click();
    await expect(page.getByRole('button', { name: 'Sleep timer, 15 min' }).first()).toBeVisible();
    await page.clock.fastForward('14:00');
    await expect(page.getByRole('button', { name: 'Sleep timer, 1 min' }).first()).toBeVisible();
    expect(await playedTo(page)).toBeGreaterThan(0);
    await page.clock.fastForward('01:00');
    await expect.poll(async () => (await audios(page)).every((a) => a.paused)).toBe(true);
    await expect(page.getByRole('button', { name: 'Sleep timer, Off' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play', exact: true }).first()).toBeVisible();
  });

  test("the sleep timer's end of chapter pauses playback at the chapter's end", async ({
    page,
  }) => {
    await playBook(page);
    for (const at of ['Off', '15 min', '30 min', '45 min', '60 min']) {
      await page
        .getByRole('button', { name: `Sleep timer, ${at}` })
        .first()
        .click();
    }
    await expect(
      page.getByRole('button', { name: 'Sleep timer, End of chapter' }).first(),
    ).toBeVisible();
    // The first chapter is the first file, 5.04 s long: playback stops there, the next unstarted.
    await expect
      .poll(async () => (await audios(page)).every((a) => a.paused), { timeout: 15_000 })
      .toBe(true);
    const [first, second] = await audios(page);
    expect(first!.src).toMatch(/\/tracks\/0$/);
    expect(first!.time).toBeGreaterThan(5.04 - 0.3);
    expect(second!.time).toBeLessThan(0.3);
  });

  test('the system’s media controls name what plays and offer its actions', async ({ page }) => {
    await playBook(page);
    const book = await titleIn(page, 'books', recorded.multiFile);
    const session = () =>
      page.evaluate(() => ({
        title: navigator.mediaSession.metadata?.title ?? null,
        state: navigator.mediaSession.playbackState,
        handled: [...(window as unknown as { handled: Set<string> }).handled].sort(),
      }));
    await expect.poll(session).toEqual({
      title: book,
      state: 'playing',
      handled: ['pause', 'play', 'seekbackward', 'seekforward', 'seekto'],
    });
  });
});
