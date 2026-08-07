/**
 * The Search view's content-type filter chips (docs/ROADMAP.md §12b, the user's
 * own example: type "hello" > select "Music" > see All/Songs/Albums/Artists) and
 * the grouped, list-shaped nothing-selected view. Chip *state* logic itself is
 * unit-tested in `apps/web/src/features/search/searchFilters.test.ts`; this file
 * only covers what a real browser renders from it.
 *
 * Fixture data reused from `apps/server/src/testSupport/fakes/fixtures`:
 * - `dune` matches the book "Dune" (`item-dune`) *and* the series "Dune"
 *   (`series-dune`) — exercises Books' All/Books/Series/Authors row with two
 *   different kinds of match from one query.
 * - `tolkien` matches only the author "J.R.R. Tolkien" (`author-tolkien`) —
 *   no book or series has "tolkien" in its title/name — so it exercises the
 *   Authors-only narrowing in isolation.
 * - `fields` matches the artist "Echo Fields" and the album "Hollow Fields"
 *   (same fixtures `search-music.spec.ts` uses) — exercises Music's
 *   All/Songs/Albums/Artists row.
 *
 * Jellyfin's connect state is process-global (see `search-music.spec.ts`'s
 * header for why) — this file connects it itself, idempotently, rather than
 * assuming another file already has.
 */
import { expect, type Page, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

/** Mantine's `Chip` is a styled checkbox (`<input type="checkbox">` + `<label>`),
 * not a `<button>` — its input is visually zero-size/opacity:0, so Playwright's
 * actionability check refuses to click it directly. Click the label, same as a
 * real pointer would (`e2e/ui/chip.spec.ts`, `browse.spec.ts`'s sort chips). */
function clickChip(page: Page, testId: string) {
  return page.getByTestId(testId).locator('label').first().click();
}

const FAKE_JELLYFIN_BASE_URL = 'http://fake.jellyfin.local';
const FAKE_JELLYFIN_USERNAME = 'nova';
const FAKE_JELLYFIN_PASSWORD = 'stardust1';

test('connecting Jellyfin from Settings (idempotent, may already be connected)', async ({
  page,
}) => {
  await page.goto('/settings');
  await page.getByTestId('jellyfin-base-url-input').fill(FAKE_JELLYFIN_BASE_URL);
  await page.getByTestId('jellyfin-username-input').fill(FAKE_JELLYFIN_USERNAME);
  await page.getByTestId('jellyfin-password-input').fill(FAKE_JELLYFIN_PASSWORD);
  await page.getByTestId('jellyfin-connect-submit').click();

  await expect(page.getByTestId('jellyfin-status-connected')).toBeVisible();
});

test('typing "hello" and selecting Music reveals All/Songs/Albums/Artists', async ({ page }) => {
  // The user's own example from the spec: the second row only exists once a
  // specific first-row type is picked, regardless of whether the query
  // matches anything.
  await page.goto('/search');
  await page.getByTestId('search-field').getByRole('combobox').fill('hello');

  await expect(page.getByTestId('search-filter-secondary')).toHaveCount(0);

  await clickChip(page, 'search-filter-primary-music');

  const secondaryRow = page.getByTestId('search-filter-secondary');
  await expect(secondaryRow).toBeVisible();
  await expect(page.getByTestId('search-filter-secondary-all')).toBeVisible();
  await expect(page.getByTestId('search-filter-secondary-songs')).toContainText('Songs');
  await expect(page.getByTestId('search-filter-secondary-albums')).toContainText('Albums');
  await expect(page.getByTestId('search-filter-secondary-artists')).toContainText('Artists');
});

test('Music + Artists narrows to just the artist match, hiding the album match', async ({
  page,
}) => {
  await page.goto('/search');
  await page.getByTestId('search-field').getByRole('combobox').fill('fields');
  await clickChip(page, 'search-filter-primary-music');

  // All (the default secondary) shows both.
  await expect(page.getByTestId('search-results-music-artists')).toBeVisible();
  await expect(page.getByTestId('search-results-music-albums')).toBeVisible();

  await clickChip(page, 'search-filter-secondary-artists');

  await expect(page.getByTestId('search-results-music-artists')).toBeVisible();
  await expect(page.getByTestId('search-result-artist-echo')).toContainText('Echo Fields');
  await expect(page.getByTestId('search-results-music-albums')).toHaveCount(0);
});

test('selecting Books reveals All/Books/Series/Authors, and Series narrows to just the series match', async ({
  page,
}) => {
  await page.goto('/search');
  await page.getByTestId('search-field').getByRole('combobox').fill('dune');
  await clickChip(page, 'search-filter-primary-books');

  await expect(page.getByTestId('search-filter-secondary-all')).toBeVisible();
  await expect(page.getByTestId('search-filter-secondary-books')).toContainText('Books');
  await expect(page.getByTestId('search-filter-secondary-series')).toContainText('Series');
  await expect(page.getByTestId('search-filter-secondary-authors')).toContainText('Authors');

  // Books + All: both the book and the series named "Dune" show, each in its
  // own section.
  await expect(page.getByTestId('search-results-books')).toBeVisible();
  await expect(page.getByTestId('search-result-item-dune')).toBeVisible();
  await expect(page.getByTestId('search-results-series')).toBeVisible();
  await expect(page.getByTestId('search-results-series')).toContainText('Dune');

  // Narrowing to Series hides the book section entirely.
  await clickChip(page, 'search-filter-secondary-series');
  await expect(page.getByTestId('search-results-books')).toHaveCount(0);
  await expect(page.getByTestId('search-results-series')).toBeVisible();
});

test('Books + Authors shows an author match with no corresponding book or series match', async ({
  page,
}) => {
  await page.goto('/search');
  await page.getByTestId('search-field').getByRole('combobox').fill('tolkien');
  await clickChip(page, 'search-filter-primary-books');
  await clickChip(page, 'search-filter-secondary-authors');

  await expect(page.getByTestId('search-results-authors')).toBeVisible();
  await expect(page.getByTestId('search-results-authors')).toContainText('J.R.R. Tolkien');
  await expect(page.getByTestId('search-results-books')).toHaveCount(0);
  await expect(page.getByTestId('search-results-series')).toHaveCount(0);
});

test('Podcasts has no second row', async ({ page }) => {
  await page.goto('/search');
  await page.getByTestId('search-field').getByRole('combobox').fill('tech');
  await clickChip(page, 'search-filter-primary-podcasts');

  await expect(page.getByTestId('search-filter-secondary')).toHaveCount(0);
});

test('clearing the primary filter (toggling it off) clears the secondary row too', async ({
  page,
}) => {
  await page.goto('/search');
  await page.getByTestId('search-field').getByRole('combobox').fill('dune');
  await clickChip(page, 'search-filter-primary-books');
  await clickChip(page, 'search-filter-secondary-series');
  await expect(page.getByTestId('search-filter-secondary-series').locator('input')).toBeChecked();

  // Toggling the already-active primary chip off clears the row entirely.
  await clickChip(page, 'search-filter-primary-books');

  await expect(page.getByTestId('search-filter-secondary')).toHaveCount(0);
  // Back to the unfiltered view: the book shows again (Series-only would have
  // hidden it).
  await expect(page.getByTestId('search-results-books')).toBeVisible();
  await expect(page.getByTestId('search-result-item-dune')).toBeVisible();
});

test('with nothing selected, every kind of result groups by content type and renders as a list, not a grid', async ({
  page,
}) => {
  await page.goto('/search');
  await page.getByTestId('search-field').getByRole('combobox').fill('dune');

  const results = page.getByTestId('search-results');
  await expect(results).toBeVisible();
  await expect(page.getByTestId('search-results-books')).toBeVisible();
  await expect(page.getByTestId('search-result-item-dune')).toBeVisible();

  // Grouped by content type, not sub-filtered — the unfiltered view never
  // shows Series/Authors sections (see `searchFilters.ts`'s doc comment for
  // why), even though this same query matches the "Dune" series too.
  await expect(page.getByTestId('search-results-series')).toHaveCount(0);
  await expect(page.getByTestId('search-results-authors')).toHaveCount(0);

  // Rendered as a list: the old card-grid class is gone from the results
  // area, replaced by the list container.
  await expect(results.locator('.auralis-card-grid')).toHaveCount(0);
  await expect(results.locator('.auralis-result-list').first()).toBeVisible();
});
