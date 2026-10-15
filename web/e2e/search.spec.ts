import { expect, test, type Page } from '@playwright/test';
import { type Recorded, serveRecorded } from './recorded';
import {
  advances,
  fontsLoaded,
  pageOf,
  signIn as signInAt,
  songsIn,
  titleIn as titleAt,
  titlePlaying,
} from './shell-steps';

/**
 * Search on the server with recorded upstreams (M2.search): suggestions as you type, from the
 * index alone, then the results of the search, whose art plays and whose rows open. The titles
 * typed and looked for are read from the server's own lists, never written here.
 */

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

let recorded: Recorded;
test.beforeAll(async () => {
  test.setTimeout(120_000);
  recorded = await serveRecorded();
});
test.afterAll(() => recorded?.stop());

const titleIn = (page: Page, medium: string, ref: { source: string; id: string }) =>
  titleAt(page, recorded.origin, medium, ref);

/** The search field, in Search's back layer. */
const field = (page: Page) => page.getByPlaceholder('What do you want to listen to?');

/** What the page shows between two of its section titles. */
async function between(page: Page, from: string, to: string) {
  const text = await page.locator('body').innerText();
  return text.slice(text.indexOf(from), text.indexOf(to));
}

/** The row titled `title`: the nearest box holding both its title and its art's Play. */
const rowOf = (page: Page, title: string) =>
  page
    .getByRole('button', { name: title, exact: true })
    .locator('xpath=ancestor::*[.//*[@aria-label="Play"]][1]');

test.describe('[M2.search/d] search on recorded upstreams', () => {
  test('types two letters for suggestions alone, submits, plays the top result and opens a book', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const asked: URL[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/search')) asked.push(url);
    });
    const calls = (from = 0) =>
      asked.slice(from).map((url) => `${url.pathname}?${url.searchParams.get('q')}`);
    await signIn(page, '/search');
    const album = await titleIn(page, 'music', recorded.album);
    const book = await titleIn(page, 'books', recorded.multiFile);
    const [song] = await songsIn(page, recorded);

    // Opened, Search asks for recent searches alone.
    await expect.poll(() => calls()).toEqual(['/api/search/suggest?']);

    // Two letters of the album's second word ("Ri" of "Rise"): no other recorded title has a
    // word that starts so, so the album leads both the suggestions and the results. Typed
    // faster than the draft settles, they make one call for suggestions, and none for results.
    const letters = album.split(' ')[1]!.slice(0, 2);
    await field(page).pressSequentially(letters, { delay: 20 });
    await expect(field(page)).toHaveValue(letters);
    await expect(page.getByText(album, { exact: true })).toBeVisible();
    expect(calls()).toEqual(['/api/search/suggest?', `/api/search/suggest?${letters}`]);

    await field(page).press('Enter');
    await expect(page).toHaveURL(`${recorded.origin}/search?q=${letters}`);
    await expect(page.getByText('Top result', { exact: true })).toBeVisible();
    await expect.poll(() => between(page, 'Top result', 'In your library')).toContain(album);
    expect(calls(2)).toEqual([`/api/search?${letters}`]);

    // Enter again on the search shown opens nothing and asks nothing.
    const entries = await page.evaluate(() => history.length);
    await field(page).press('Enter');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => history.length)).toBe(entries);
    expect(calls(2)).toEqual([`/api/search?${letters}`]);

    await fontsLoaded(page);
    await rowOf(page, album).getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => titlePlaying(page)).toBe(song);
    await expect(page.getByRole('button', { name: `Open player, ${song}` })).toBeVisible();
    await advances(page);
    // On the music queue, as the server says.
    const musicQueue = async () =>
      JSON.stringify(await (await page.request.get(`${recorded.origin}/api/queues/music`)).json());
    await expect.poll(musicQueue).toContain(song);

    // Its row opens the album; back, the results are as they were.
    await page.getByRole('button', { name: album, exact: true }).click();
    await expect(page).toHaveURL(pageOf('/music/albums/', recorded.album));
    await page.goBack();
    await expect(page).toHaveURL(`${recorded.origin}/search?q=${letters}`);
    await expect.poll(() => between(page, 'Top result', 'In your library')).toContain(album);

    // A book's own word ("Po" of "Poems"): typed over the search, the results give way to
    // suggestions; submitted, only the new search is asked for, and its row opens the book.
    const bookLetters = book.split(' ')[1]!.slice(0, 2);
    await field(page).fill('');
    await field(page).pressSequentially(bookLetters, { delay: 20 });
    await expect(page.getByText('Top result', { exact: true })).toHaveCount(0);
    await expect(page.getByText(book, { exact: true })).toBeVisible();
    const submitted = asked.length;
    await field(page).press('Enter');
    await expect(page).toHaveURL(`${recorded.origin}/search?q=${bookLetters}`);
    await expect.poll(() => calls(submitted)).toContain(`/api/search?${bookLetters}`);
    expect(calls(submitted)).toEqual([`/api/search?${bookLetters}`]);
    await fontsLoaded(page);
    await page.getByRole('button', { name: book, exact: true }).click();
    await expect(page).toHaveURL(pageOf('/books/', recorded.multiFile));
    await expect(page.getByText(book, { exact: true }).first()).toBeVisible();
  });
});

/** Signs in from the page `path`, landing back on it. */
function signIn(page: Page, path: string) {
  return signInAt(page, recorded.origin, path);
}

/**
 * A destination on the bottom bar or the rail: the button named by its label and showing it, not
 * a toggle (the kind filter's "Books" shares the name, and says whether it is pressed) nor an
 * app bar's glyph button (Music's "Search").
 */
const destination = (page: Page, label: string) =>
  page
    .getByRole('button', { name: label, exact: true })
    .and(page.locator(':not([aria-pressed])'))
    .filter({ hasText: new RegExp(label) });

/** What went wrong in the page: uncaught errors, and the router's error page. */
function failures(page: Page) {
  const seen: string[] = [];
  page.on('pageerror', (error) => seen.push(error.message));
  return async () => {
    const shown = await page.getByText('Unexpected Application Error').count();
    return [...seen, ...(shown > 0 ? ['the error page'] : [])];
  };
}

test.describe('search, left through the shell', () => {
  for (const size of [
    { name: 'desktop, through the rail', width: 1440, height: 900 },
    { name: 'phone, through the bottom bar', width: 390, height: 844 },
  ]) {
    test(`leaves results and suggestions for another page, ${size.name}`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width: size.width, height: size.height });
      const album = await (async () => {
        await signIn(page, '/music');
        return titleIn(page, 'music', recorded.album);
      })();
      const book = await titleIn(page, 'books', recorded.multiFile);
      const letters = album.split(' ')[1]!.slice(0, 2);
      const failed = failures(page);

      // From a search's results to Music.
      await page.goto(`${recorded.origin}/search?q=${letters}`);
      await expect.poll(() => between(page, 'Top result', 'In your library')).toContain(album);
      await destination(page, 'Music').click();
      await expect(page).toHaveURL(`${recorded.origin}/music`);
      await expect(page.getByText(album, { exact: true }).first()).toBeVisible();
      expect(await failed()).toEqual([]);

      // Back to Search, which reopens the search left; typing a book's letters over it for
      // suggestions, then to Books.
      await destination(page, 'Search').click();
      await expect(page).toHaveURL(new RegExp(`^${recorded.origin}/search`));
      const bookLetters = book.split(' ')[1]!.slice(0, 2);
      await field(page).fill('');
      await field(page).pressSequentially(bookLetters, { delay: 20 });
      await expect(page.getByText(book, { exact: true })).toBeVisible();
      await expect(page.getByText('Top result', { exact: true })).toHaveCount(0);
      await destination(page, 'Books').click();
      await expect(page).toHaveURL(`${recorded.origin}/books`);
      await expect(page.getByText(book, { exact: true }).first()).toBeVisible();
      expect(await failed()).toEqual([]);
    });
  }
});

test.describe('a search that finds nothing', () => {
  test('says nothing was found, that a search failed when it did, and asks it again on Enter', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, '/search?q=zzqxv');
    await expect(page.getByText('Nothing found', { exact: true })).toBeVisible();
    await expect(page.getByText('Top result', { exact: true })).toHaveCount(0);
    const album = await titleIn(page, 'music', recorded.album);
    const letters = album.split(' ')[1]!.slice(0, 2);

    // The server fails the search itself, GET /api/search, and nothing else: its suggestions
    // still come.
    let failing = true;
    await page.route(
      (url) => url.pathname === '/api/search',
      (route) =>
        failing
          ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' })
          : route.continue(),
    );
    await field(page).fill(letters);
    await expect(page.getByText(album, { exact: true })).toBeVisible();
    await field(page).press('Enter');
    await expect(page).toHaveURL(`${recorded.origin}/search?q=${letters}`);
    await expect(page.getByText('Search failed', { exact: true })).toBeVisible();
    await expect(page.getByText('Top result', { exact: true })).toHaveCount(0);

    // Once the server answers, Enter on the same text asks again, opening no new entry.
    failing = false;
    const entries = await page.evaluate(() => history.length);
    await field(page).press('Enter');
    await expect(page.getByText('Top result', { exact: true })).toBeVisible();
    await expect.poll(() => between(page, 'Top result', 'In your library')).toContain(album);
    await expect(page.getByText('Search failed', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => history.length)).toBe(entries);
  });
});
