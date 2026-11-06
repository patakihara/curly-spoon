import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { type Recorded, serveRecorded } from './recorded';
import { fontsLoaded, signIn, titlePlaying } from './shell-steps';

/**
 * Asking for a book the library lacks, from Search, on the server with recorded upstreams: the rows
 * are the recorded Audible search, and the stand-in medium (`server/e2e/standInMedia.ts`, never in
 * the image) brings the book in as a recorded item of the index.
 */

const JEKYLL = 'The Strange Case of Dr Jekyll and Mr Hyde';
const ALONE = 'Alone in the Stacks';
const LOOKING_AGAIN = { timeout: 15_000 };

const SIZES = [
  { name: 'phone', viewport: { width: 390, height: 844 } },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
];

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

let recorded: Recorded;
const serve = async (bookSource?: 'slow' | 'failing') => {
  recorded = await serveRecorded({ nothingPlayed: true, ...(bookSource ? { bookSource } : {}) });
};
test.beforeEach(() => test.setTimeout(90_000));
test.afterEach(() => recorded?.stop());

const search = async (page: Page, q: string) => {
  await signIn(page, recorded.origin, `/search?q=${encodeURIComponent(q)}`, { everyone: false });
  await fontsLoaded(page);
};

/** The book's row in Search: ResultRow's root, around its title's line and its text column. */
const bookRow = (page: Page, title: string) =>
  page.getByText(title, { exact: true }).first().locator('xpath=ancestor::div[3]');

const request = (row: Locator) => row.getByRole('button', { name: 'Request', exact: true });

/** The titles the person's own books list holds. */
async function ownBooks(page: Page) {
  const { items } = (await (
    await page.request.get(`${recorded.origin}/api/library/books`)
  ).json()) as {
    items: { title: string; ref: { source: string; id: string } }[];
  };
  return items;
}

for (const { name, viewport } of SIZES) {
  test.describe(`at ${viewport.width} px`, () => {
    test.use({ viewport });

    test(`[M3.books] a book you lack is requested, followed to In library, and plays from your library (${name})`, async ({
      page,
    }, info) => {
      await serve();
      await search(page, 'jekyll stevenson');
      const shot = (step: string) =>
        page.screenshot({ path: info.outputPath(`${name}-${step}.png`), fullPage: true });

      const row = bookRow(page, JEKYLL);
      await expect(request(row)).toBeVisible();
      await expect(row.getByText('In library')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Your requests', exact: true })).toHaveCount(0);
      await expect(page.getByText('Top result', { exact: true })).toHaveCount(0);
      await shot('offered');
      const before = await ownBooks(page);

      await request(row).click();
      await expect(row).toContainText('38%', LOOKING_AGAIN);
      await expect(row.getByRole('button', { name: /^Request/ })).toHaveCount(0);
      await shot('requested');

      await page.getByRole('button', { name: 'Your requests', exact: true }).click();
      await expect(page).toHaveURL(`${recorded.origin}/requests`);
      await expect(page.getByText(JEKYLL, { exact: true })).toBeVisible();
      await expect(page.locator('body')).toContainText('38%', LOOKING_AGAIN);
      await shot('in-your-requests');

      await page.goto(`${recorded.origin}/search?q=jekyll+stevenson`);
      await expect(bookRow(page, JEKYLL)).toContainText('In library', { timeout: 40_000 });
      await expect(bookRow(page, JEKYLL).getByRole('button', { name: /^Request/ })).toHaveCount(0);
      await shot('in-library');

      const after = await ownBooks(page);
      const arrived = after.find((own) => !before.some((b) => b.title === own.title));
      expect(arrived, 'the request put a book in your own library').toBeDefined();

      await page.goto(`${recorded.origin}/books`);
      await fontsLoaded(page);
      await expect(page.getByText(arrived!.title, { exact: true }).first()).toBeVisible();
      await shot('your-library');

      // The row that says In library plays the book its request brought.
      await page.goto(`${recorded.origin}/search?q=jekyll+stevenson`);
      await fontsLoaded(page);
      const there = bookRow(page, JEKYLL);
      await there.hover();
      await there.getByRole('button', { name: 'Play', exact: true }).click();
      await expect.poll(() => titlePlaying(page), LOOKING_AGAIN).toBe(arrived!.title);
    });

    test(`[M3.books] a request that fails says why (${name})`, async ({ page }, info) => {
      await serve();
      await search(page, 'alone in the stacks');
      const row = bookRow(page, ALONE);
      await request(row).click();
      await expect(row).toContainText('Failed', LOOKING_AGAIN);
      await expect(request(row)).toHaveCount(0);
      await page.screenshot({ path: info.outputPath(`${name}-failed.png`), fullPage: true });

      await page.getByRole('button', { name: 'Your requests', exact: true }).click();
      await expect(page.getByText('The download failed', { exact: true })).toBeVisible(
        LOOKING_AGAIN,
      );
      await page.screenshot({ path: info.outputPath(`${name}-failed-why.png`), fullPage: true });
    });
  });
}

test.describe('[M3.books] tapping Request', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('makes one request from a double tap', async ({ page }) => {
    await serve();
    await search(page, 'jekyll stevenson');
    const posts: string[] = [];
    page.on('request', (sent) => {
      if (sent.method() === 'POST' && new URL(sent.url()).pathname === '/api/requests') {
        posts.push(sent.url());
      }
    });
    const row = bookRow(page, JEKYLL);
    await request(row).dblclick();
    await expect(request(row)).toHaveCount(0);
    expect(posts).toHaveLength(1);
    const { inFlight } = (await (
      await page.request.get(`${recorded.origin}/api/requests`)
    ).json()) as {
      inFlight: unknown[];
    };
    expect(inFlight).toHaveLength(1);
  });

  test('says so on its row when the tap does not go through, and can be tapped again', async ({
    page,
  }, info) => {
    await serve();
    await search(page, 'jekyll stevenson');
    const refuse = (route: { abort(): Promise<void> }) => route.abort();
    await page.route('**/api/requests', refuse);
    const row = bookRow(page, JEKYLL);
    await request(row).click();
    await expect(row).toContainText('Request failed');
    await page.screenshot({ path: info.outputPath('phone-tap-failed.png'), fullPage: true });

    await page.unroute('**/api/requests', refuse);
    await request(row).click();
    await expect(request(row)).toHaveCount(0);
    await expect(row).not.toContainText('Request failed');
  });
});

test.describe('[M3.books] too many requests', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('says so in the banner, and the row keeps its Request', async ({ page }, info) => {
    await serve();
    await search(page, 'jekyll stevenson');
    const refuse = (route: Route) =>
      route.fulfill({ status: 429, json: { error: 'too_many_requests' } });
    await page.route('**/api/requests', refuse);
    const row = bookRow(page, JEKYLL);
    await request(row).click();
    await expect(page.getByText('You have too many requests under way.')).toBeVisible();
    await expect(row).not.toContainText('Request failed');
    await expect(request(row)).toBeVisible();
    await page.screenshot({ path: info.outputPath('phone-too-many.png'), fullPage: true });

    await page.unroute('**/api/requests', refuse);
    await request(row).click();
    await expect(page.getByText('You have too many requests under way.')).toHaveCount(0);
  });
});

test.describe('[M3.books] Search and the source of books', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  /** A book the recorded index holds, by its title as the server lists it. */
  async function ownedTitle(page: Page) {
    await signIn(page, recorded.origin, '/search', { everyone: true });
    const { items } = (await (
      await page.request.get(`${recorded.origin}/api/library/books`)
    ).json()) as { items: { title: string }[] };
    return items[0]!.title;
  }

  test('offers no request for a book the household holds', async ({ page }) => {
    await serve();
    const title = await ownedTitle(page);
    await page.goto(`${recorded.origin}/search?q=${encodeURIComponent(title)}`);
    await fontsLoaded(page);
    await expect(page.getByText('Top result', { exact: true })).toBeVisible();
    // The source named it too, and a book you lack beside it, so the rows did draw.
    await expect(request(bookRow(page, ALONE))).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request', exact: true })).toHaveCount(1);
  });

  for (const source of ['slow', 'failing'] as const) {
    test(`still draws the library's rows when the source is ${source}`, async ({ page }) => {
      await serve(source);
      const title = await ownedTitle(page);
      await page.goto(`${recorded.origin}/search?q=${encodeURIComponent(title)}`);
      await fontsLoaded(page);
      await expect(page.getByText('Top result', { exact: true })).toBeVisible(LOOKING_AGAIN);
      await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Request', exact: true })).toHaveCount(0);
    });
  }
});
