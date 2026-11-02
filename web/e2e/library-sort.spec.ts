import { expect, test, type Page } from '@playwright/test';
import { type Recorded, serveRecorded } from './recorded';
import { signIn as signInAt } from './shell-steps';

/**
 * A library home's sorts in the web shell, on the server with recorded upstreams (M2.sorting): the
 * sort menu replaces the page's address, which asks `GET /api/library/{medium}` for that order.
 * Books by Author draws the author order, Random the order of the seed in the address, and
 * choosing Random again draws a fresh seed and asks again. Its own server, so its sign-ins count
 * against their own rate limit.
 */

let recorded: Recorded;
test.beforeAll(async () => {
  test.setTimeout(120_000);
  recorded = await serveRecorded();
});
test.afterAll(() => recorded?.stop());

const signIn = (page: Page, path: string) => signInAt(page, recorded.origin, path);

interface Listed {
  title: string;
  sub: string | null;
}

/** The books the server lists in `query`'s order, and the sort and seed it answered. */
async function booksIn(page: Page, query: string) {
  const listed = await page.request.get(`${recorded.origin}/api/library/books${query}`);
  return (await listed.json()) as { items: Listed[]; sort: string; seed: number | null };
}

/** The books' cards the page draws, by title, in the order it draws them. */
async function cardsShown(page: Page, titles: string[]) {
  const labels = await page
    .locator('[role=button][aria-label]')
    .evaluateAll((cards) => cards.map((c) => c.getAttribute('aria-label') ?? ''));
  return labels.filter((label) => titles.includes(label));
}

/** The request for the books list the page makes next, as its query. */
const nextAsk = (page: Page) =>
  page
    .waitForRequest((r) => new URL(r.url()).pathname === '/api/library/books')
    .then((r) => new URL(r.url()).search);

/** The sort bar's label, which opens its menu: its glyph's name, then the sort it names. */
const sortButton = (page: Page, label: string) =>
  page.getByRole('button', { name: new RegExp(`^swap_vert\\s*${label}$`) });

test.describe('[M2.sorting/a] a library home in the order chosen', () => {
  test('Books by Author draws the books in author order, ties by title', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, '/books');
    const { items } = await booksIn(page, '');
    const titles = items.map((b) => b.title);
    const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
    const byAuthor = [...items]
      .sort(
        (a, b) => collator.compare(a.sub ?? '', b.sub ?? '') || collator.compare(a.title, b.title),
      )
      .map((b) => b.title);
    expect(byAuthor, 'the recorded books differ in title and author order').not.toEqual(titles);
    await expect.poll(() => cardsShown(page, titles)).toEqual(titles);

    const asked = nextAsk(page);
    await sortButton(page, 'Title').click();
    await page.getByRole('menuitemradio', { name: 'Author' }).click();
    expect(await asked).toBe('?sort=artist');
    await expect(page).toHaveURL(`${recorded.origin}/books?sort=artist`);
    await expect.poll(() => cardsShown(page, titles)).toEqual(byAuthor);
    await expect(sortButton(page, 'Author'), 'the bar names the sort answered').toBeVisible();
  });

  test("Random draws the order of the address's seed, and choosing it again reshuffles", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const asked = page
      .waitForRequest((r) => new URL(r.url()).pathname === '/api/library/books')
      .then((r) => new URL(r.url()).search);
    await signIn(page, '/books?sort=random&seed=42');
    expect(await asked).toBe('?sort=random&seed=42');
    const seeded = await booksIn(page, '?sort=random&seed=42');
    const titles = seeded.items.map((b) => b.title);
    const byTitle = (await booksIn(page, '')).items.map((b) => b.title);
    expect(titles, 'seed 42 shuffles the recorded books').not.toEqual(byTitle);
    await expect.poll(() => cardsShown(page, titles)).toEqual(titles);
    await expect(sortButton(page, 'Random')).toBeVisible();

    const again = nextAsk(page);
    await sortButton(page, 'Random').click();
    await page.getByRole('menuitemradio', { name: 'Random' }).click();
    const search = new URLSearchParams(await again);
    expect(search.get('sort')).toBe('random');
    const seed = search.get('seed')!;
    expect(seed).toMatch(/^\d+$/);
    expect(seed, 'a fresh seed').not.toBe('42');
    await expect(page).toHaveURL(`${recorded.origin}/books?sort=random&seed=${seed}`);
    const reshuffled = (await booksIn(page, `?sort=random&seed=${seed}`)).items.map((b) => b.title);
    await expect.poll(() => cardsShown(page, titles)).toEqual(reshuffled);

    // Title drops the seed.
    const title = nextAsk(page);
    await sortButton(page, 'Random').click();
    await page.getByRole('menuitemradio', { name: 'Title' }).click();
    expect(await title).toBe('?sort=title');
    await expect.poll(() => cardsShown(page, titles)).toEqual(byTitle);
  });

  test('a bad seed in the address is ignored, and the page still draws a shuffle', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const asked = page
      .waitForRequest((r) => new URL(r.url()).pathname === '/api/library/books')
      .then((r) => new URL(r.url()).search);
    await signIn(page, '/books?sort=random&seed=-3');
    expect(await asked).toBe('?sort=random');
    await expect(sortButton(page, 'Random')).toBeVisible();
  });
});
