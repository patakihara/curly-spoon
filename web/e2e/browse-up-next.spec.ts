import { expect, test, type Page } from '@playwright/test';
import { type Recorded, serveRecorded } from './recorded';
import {
  advances,
  episodeTitleIn,
  goWithin,
  keyOf,
  signIn as signInAt,
  titleIn,
  titlePlaying,
} from './shell-steps';

/**
 * Browse's Up next in the web shell, on the server with recorded upstreams (M2.sorting): an
 * episode played from its own page is on Browse's Up next shelf, opening its page, and Still
 * listening, which needs a second book or show heard, is left out, unnamed, while only one show
 * and one book have been. A play is written to your history once it stops being current, and the
 * recorded Audiobookshelf keeps no progress sent to it, so the book is played after the episode.
 * The book, still playing, was last heard when the recording's Audiobookshelf last changed it, so
 * the episode leads Up next. Its own server, so its sign-ins count against their own rate limit.
 */

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

let recorded: Recorded;
test.beforeAll(async () => {
  test.setTimeout(120_000);
  recorded = await serveRecorded();
});
test.afterAll(() => recorded?.stop());

const signIn = (page: Page, path: string) => signInAt(page, recorded.origin, path);

/** The cards a titled section of Browse draws, by their titles. */
const shelfCards = (page: Page, section: string) =>
  page
    .locator('section')
    .filter({ has: page.getByText(section, { exact: true }) })
    .locator('[role=button][aria-label]')
    .evaluateAll((cards) => cards.map((c) => c.getAttribute('aria-label') ?? ''));

test.describe("[M2.sorting/b] Browse's Up next from your own listening", () => {
  test('an episode played from its page is under Up next, and Still listening is left out with one show heard', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, `/podcasts/episodes/${keyOf(recorded.episode)}`);
    const title = await episodeTitleIn(page, recorded);
    await page.getByRole('button', { name: /^play_arrow\s*Play$/ }).click();
    await advances(page);
    await expect.poll(() => titlePlaying(page)).toBe(title);
    const book = await titleIn(page, recorded.origin, 'books', recorded.multiFile);
    await goWithin(page, `/books/${keyOf(recorded.multiFile)}`);
    await page.getByRole('button', { name: /Resume$/ }).click();
    await expect.poll(() => titlePlaying(page)).toBe(book);

    const feed = page.waitForResponse(`${recorded.origin}/api/feed`);
    await goWithin(page, '/');
    expect((await feed).status()).toBe(200);
    await expect(page.getByText('Up next', { exact: true })).toBeVisible();
    await expect.poll(() => shelfCards(page, 'Up next')).toEqual([title, book]);
    await expect(page.getByText('Still listening', { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: title, exact: true }).first().click();
    await expect(page).toHaveURL(
      new RegExp(`/podcasts/episodes/${recorded.episode.source}(?::|%3A)${recorded.episode.id}$`),
    );
  });
});
