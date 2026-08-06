/**
 * Podcast discovery (Phase 8, wave B): search the directory or paste an RSS URL,
 * preview the real feed, then subscribe.
 *
 * Fixture data (`apps/server/src/testSupport/fakes/fakeAbs.ts`): the directory
 * search term "daily tech" matches "The Daily Tech Digest" (itunesId 987654321,
 * feedUrl `https://feeds.fake.abs.local/daily-tech.xml`), and that exact feed URL
 * previews to a one-episode feed ("Episode 1: Welcome"). `lib-podcasts` is the
 * fixture's podcast-mediaType library, with one folder — the target `POST
 * /podcasts` subscribes into.
 *
 * These tests don't share state the way `requests.spec.ts` does: each one does
 * its own search/preview (read-only against the fake) or its own subscribe
 * (which only ever adds a new, independent item), so no `serial` mode is needed.
 *
 * Three of the tests below (`subscribing … announces …`, `a link inside a
 * directory result's description …`, and `the podcast search field shows a
 * keyboard focus ring`) are phase 10's accessibility-audit findings against
 * `PodcastDiscoverPage.tsx`/`PodcastFeedPreview.tsx`/`@auralis/ui`'s `SearchField`
 * — see those files' own doc comments (near `snackbar.enqueue`, the
 * `onClick={(event) => event.stopPropagation()}` wrapper, and
 * `SearchField.css`'s `.m3-search-field input:focus-visible` rule) for the
 * reasoning behind each fix.
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Signed in already, via the `app` project's `storageState`.
  await page.goto('/podcasts/discover');
  await expect(page.getByTestId('podcast-discover-page')).toBeVisible();
});

test('the podcast library page has an "Add podcast" entry point that opens discovery', async ({
  page,
}) => {
  await page.goto('/library/lib-podcasts');
  await expect(page.getByTestId('library-page')).toBeVisible();

  await page.getByTestId('add-podcast').click();
  await expect(page.getByTestId('podcast-discover-page')).toBeVisible();
});

test('searching the directory and selecting a result previews the real feed, including episodes', async ({
  page,
}) => {
  await page.getByTestId('podcast-search-field').getByRole('combobox').fill('daily tech');
  await page.getByTestId('podcast-search-submit').click();

  const result = page.getByTestId('podcast-result-987654321');
  await expect(result).toBeVisible();
  await expect(result.getByText('The Daily Tech Digest')).toBeVisible();

  await result.click();

  const preview = page.getByTestId('podcast-preview');
  await expect(preview).toBeVisible();
  await expect(preview.getByText('The Daily Tech Digest')).toBeVisible();
  await expect(page.getByTestId('podcast-preview-episodes')).toContainText('Episode 1: Welcome');
  await expect(page.getByTestId('podcast-subscribe')).toBeVisible();
});

test('subscribing after a preview shows a success state', async ({ page }) => {
  await page.getByTestId('podcast-search-field').getByRole('combobox').fill('daily tech');
  await page.getByTestId('podcast-search-submit').click();
  await page.getByTestId('podcast-result-987654321').click();
  await expect(page.getByTestId('podcast-preview')).toBeVisible();

  await page.getByTestId('podcast-subscribe').click();
  await expect(page.getByTestId('podcast-subscribe-success')).toBeVisible();
});

test('subscribing announces success to assistive tech, not just visually', async ({ page }) => {
  // Before the fix, the only observable change on subscribe was the "Subscribe"
  // `Button` being replaced by a "Subscribed" `Chip` — a purely visual swap with no
  // `aria-live` region and nothing moving focus, so a screen reader user got no
  // signal that the action had succeeded. `Snackbar` (role="status",
  // aria-live="polite") is the fix; this asserts the announcement region itself,
  // not just the chip that was already covered above.
  await page.getByTestId('podcast-search-field').getByRole('combobox').fill('daily tech');
  await page.getByTestId('podcast-search-submit').click();
  await page.getByTestId('podcast-result-987654321').click();
  await expect(page.getByTestId('podcast-preview')).toBeVisible();

  await page.getByTestId('podcast-subscribe').click();

  const status = page.getByRole('status');
  await expect(status).toBeVisible();
  await expect(status).toContainText('Subscribed to The Daily Tech Digest');
  await expect(status).toHaveAttribute('aria-live', 'polite');
});

test("a link inside a directory result's description doesn't also select the card", async ({
  page,
  context,
}) => {
  // `PodcastDiscoverPage.tsx` renders each directory result's `descriptionPlain`
  // through `RichDescription`, which can produce a real `<a>` — nested inside this
  // `Card`'s own `<button>` (an interactive-content violation the browser still
  // renders, since React builds the DOM directly rather than through the HTML
  // parser that would otherwise reject it). Before the fix, activating that link —
  // by click or by keyboard Enter, both of which dispatch a `click` that bubbles —
  // *also* fired the card's `onClick` and started an unwanted feed preview at the
  // same moment the link navigated away. This intercepts the directory-search
  // response to inject a result whose description contains a link, the way a real
  // iTunes/podcast-directory response might, and confirms only the link activates.
  await page.route('**/api/v1/podcasts/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [
          {
            itunesId: 555,
            title: 'Linky Cast',
            artistName: 'Someone',
            descriptionPlain: 'Visit <a href="https://example.com">our site</a> for more.',
            cover: null,
            feedUrl: 'https://feeds.fake.abs.local/linky.xml',
            pageUrl: null,
          },
        ],
      }),
    });
  });
  let feedFetched = false;
  await page.route('**/api/v1/podcasts/feed**', async (route) => {
    feedFetched = true;
    await route.continue();
  });

  await page.getByTestId('podcast-search-field').getByRole('combobox').fill('linky');
  await page.getByTestId('podcast-search-submit').click();

  const card = page.getByTestId('podcast-result-555');
  await expect(card).toBeVisible();

  const [popup] = await Promise.all([context.waitForEvent('page'), card.locator('a').click()]);
  await popup.close();

  // The link navigated (proving it's still reachable/operable); the card's own
  // preview action must not have fired alongside it.
  expect(feedFetched).toBe(false);
  await expect(page.getByTestId('podcast-preview')).toHaveCount(0);
});

test('pasting an RSS URL directly previews the feed, with no directory search needed', async ({
  page,
}) => {
  await page.getByTestId('podcast-rss-input').fill('https://feeds.fake.abs.local/daily-tech.xml');
  await page.getByTestId('podcast-rss-preview').click();

  const preview = page.getByTestId('podcast-preview');
  await expect(preview).toBeVisible();
  await expect(preview.getByText('The Daily Tech Digest')).toBeVisible();
  await expect(page.getByTestId('podcast-subscribe')).toBeVisible();
});

test('the podcast search field shows a keyboard focus ring', async ({ page }) => {
  // Found by measuring, not reading: Mantine's own `TextInput` CSS sets
  // `outline: none` on focus and swaps a `--input-bd` custom property instead,
  // expecting a border-colour change to read as the indicator — but that swap
  // never reached this field's underlying `<input>` (root cause undetermined,
  // documented in `SearchField.css`), so before the fix, tabbing to this field
  // left literally no visible sign it was focused: identical `border-color`,
  // `outline-style: none`, `box-shadow: none`, despite the element correctly
  // matching `:focus-visible`. `SearchField.css` now paints an explicit ring
  // there, independent of Mantine's variable cascade.
  const combobox = page.getByTestId('podcast-search-field').getByRole('combobox');
  await combobox.focus();
  await expect(combobox).toHaveCSS('outline-style', 'solid');
  const outlineWidth = await combobox.evaluate((el) =>
    parseFloat(getComputedStyle(el).outlineWidth),
  );
  expect(outlineWidth).toBeGreaterThan(0);
});
