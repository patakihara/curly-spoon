/**
 * The audiobook browse surfaces: home shelves, library filter/sort, and search.
 *
 * Fixture data (apps/server/src/testSupport/fakes/fixtures): `lib-books` has
 * three books — Dune (item-dune, 1260s), The Fellowship of the Ring
 * (item-fellowship, 720s), The Hobbit (item-hobbit, 660s) — split across a
 * "Continue Listening" shelf (Fellowship only) and a "Recently Added" shelf
 * (all three). `lib-podcasts` holds item-dailytech.
 *
 * Two behaviours from the spec are NOT covered here and are called out in the
 * phase report rather than faked: a progress bar on a continue-listening card,
 * and the "Finished" filter actually hiding something. Both require
 * `item.progress` to be non-null, but neither `GET .../personalized` nor
 * `GET .../items` in apps/server/src/testSupport/fakes/fakeAbs.ts attaches
 * `userMediaProgress` to the items they return (only `GET /api/items/:id
 * ?include=progress` and the unwired `/api/me/items-in-progress` do). Seeding
 * progress via `PATCH /api/v1/progress/:itemId` before the test would update
 * that in-memory store, but these two read paths never consult it, so the UI
 * would never show a progress bar or a finished item no matter what is
 * seeded. A real test needs `apps/server/src/testSupport/fakes/fakeAbs.ts` to
 * call `withProgress` in its `personalized` and `items` branches first.
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Signed in already, via the `app` project's `storageState`.
  await page.goto('/');
  await expect(page.getByTestId('home-page')).toBeVisible();
});

test('home renders at least one shelf with items', async ({ page }) => {
  const shelf = page.getByTestId('shelf-shelf-recently-added');

  await expect(shelf).toBeVisible();
  await expect(shelf.getByTestId('shelf-item-item-dune')).toBeVisible();
  await expect(shelf.getByTestId('shelf-item-item-fellowship')).toBeVisible();
  await expect(shelf.getByTestId('shelf-item-item-hobbit')).toBeVisible();
});

test('clicking a shelf card opens that book', async ({ page }) => {
  await page.getByTestId('shelf-item-item-dune').click();

  await expect(page).toHaveURL(/\/item\/item-dune$/);
  await expect(page.getByTestId('item-page')).toBeVisible();
});

test('the library filter narrows the visible cards by title or author', async ({ page }) => {
  await page.goto('/library/lib-books');
  await expect(page.getByTestId('library-item-cards')).toBeVisible();
  await expect(page.getByTestId('item-card-item-dune')).toBeVisible();
  await expect(page.getByTestId('item-card-item-fellowship')).toBeVisible();
  await expect(page.getByTestId('item-card-item-hobbit')).toBeVisible();

  await page.getByTestId('library-filter-input').fill('dune');

  await expect(page.getByTestId('item-card-item-dune')).toBeVisible();
  await expect(page.getByTestId('item-card-item-fellowship')).toHaveCount(0);
  await expect(page.getByTestId('item-card-item-hobbit')).toHaveCount(0);

  // The author fixture only has "Frank Herbert" on Dune, so this also proves
  // the filter checks author, not only title.
  await page.getByTestId('library-filter-input').fill('tolkien');

  await expect(page.getByTestId('item-card-item-dune')).toHaveCount(0);
  await expect(page.getByTestId('item-card-item-fellowship')).toBeVisible();
  await expect(page.getByTestId('item-card-item-hobbit')).toBeVisible();
});

test('the Duration sort chip reorders the cards shortest to longest', async ({ page }) => {
  await page.goto('/library/lib-books');
  const cards = page.getByTestId('library-item-cards');
  await expect(cards).toBeVisible();

  // Title is the default sort: alphabetical puts Dune first.
  await expect(cards.locator('h2')).toHaveText([
    'Dune',
    'The Fellowship of the Ring',
    'The Hobbit',
  ]);

  // Mantine's Chip is a styled checkbox (`<input type="checkbox">` + `<label>`), not a
  // `<button>` — click the label, same as chip.spec.ts's fix for the identical DOM drift.
  await page.getByTestId('sort-duration').locator('label').first().click();

  // The Hobbit (660s) < The Fellowship of the Ring (720s) < Dune (1260s) — a
  // genuinely different order from the title default, not a coincidental match.
  await expect(cards.locator('h2')).toHaveText([
    'The Hobbit',
    'The Fellowship of the Ring',
    'Dune',
  ]);
});

test('searching for "dune" shows a book result, and clicking it opens the item', async ({
  page,
}) => {
  await page.goto('/search');
  await expect(page.getByTestId('search-page')).toBeVisible();

  await page.getByTestId('search-field').getByRole('combobox').fill('dune');

  await expect(page.getByTestId('search-results-books')).toBeVisible();
  await expect(page.getByTestId('search-result-item-dune')).toBeVisible();

  await page.getByTestId('search-result-item-dune').click();

  await expect(page).toHaveURL(/\/item\/item-dune$/);
  await expect(page.getByTestId('item-page')).toBeVisible();
});

test('an empty search prompts instead of showing "no matches"', async ({ page }) => {
  await page.goto('/search');

  await expect(
    page.getByText('Start typing to search titles, authors and narrators.'),
  ).toBeVisible();
});

test('a search with no hits says so by name', async ({ page }) => {
  await page.goto('/search');

  await page.getByTestId('search-field').getByRole('combobox').fill('zzz-no-such-book');

  await expect(page.getByText('No matches for "zzz-no-such-book".')).toBeVisible();
});
