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
    await signIn(page, '/search');
    const album = await titleIn(page, 'music', recorded.album);
    const book = await titleIn(page, 'books', recorded.multiFile);
    const [song] = await songsIn(page, recorded);

    const asked: URL[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/search')) asked.push(url);
    });

    // Two letters of the album's second word ("Ri" of "Rise"): no other recorded title has a
    // word that starts so, so the album leads both the suggestions and the results.
    const letters = album.split(' ')[1]!.slice(0, 2);
    await field(page).pressSequentially(letters, { delay: 20 });
    await expect(field(page)).toHaveValue(letters);
    await expect(page.getByText(album, { exact: true })).toBeVisible();
    expect(asked.map((url) => url.pathname)).toEqual(asked.map(() => '/api/search/suggest'));
    expect(asked.map((url) => url.searchParams.get('q'))).toContain(letters);

    await field(page).press('Enter');
    await expect(page).toHaveURL(`${recorded.origin}/search?q=${letters}`);
    await expect(page.getByText('Top result', { exact: true })).toBeVisible();
    await expect.poll(() => between(page, 'Top result', 'In your library')).toContain(album);
    expect(asked.some((url) => url.pathname === '/api/search')).toBe(true);

    await fontsLoaded(page);
    await rowOf(page, album).getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => titlePlaying(page)).toBe(song);
    await expect(page.getByRole('button', { name: `Open player, ${song}` })).toBeVisible();
    await advances(page);

    // Its row opens the album; back, the results are as they were.
    await page.getByRole('button', { name: album, exact: true }).click();
    await expect(page).toHaveURL(pageOf('/music/albums/', recorded.album));
    await page.goBack();
    await expect(page).toHaveURL(`${recorded.origin}/search?q=${letters}`);
    await expect.poll(() => between(page, 'Top result', 'In your library')).toContain(album);

    // A book's own word ("Po" of "Poems"), and its row opens the book.
    const bookLetters = book.split(' ')[1]!.slice(0, 2);
    await field(page).fill('');
    await field(page).pressSequentially(bookLetters, { delay: 20 });
    await field(page).press('Enter');
    await expect(page).toHaveURL(`${recorded.origin}/search?q=${bookLetters}`);
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
