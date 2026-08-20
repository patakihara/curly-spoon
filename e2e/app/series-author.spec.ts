/**
 * Series and author detail pages (docs/agent-specs/04-phase12c1…): a Search
 * "Series"/"Authors" result now navigates somewhere, the books on each page
 * render in the right order, and an unknown id degrades to a real not-found
 * state rather than a blank page.
 *
 * Fixture data (`apps/server/src/testSupport/fakes/fixtures`):
 * - series "Dune" (`series-dune`) has one member, the book "Dune" (`item-dune`,
 *   author "Frank Herbert" / `author-herbert`).
 * - series "The Lord of the Rings" (`series-lotr`) has three members, in
 *   sequence order: "The Fellowship of the Ring" (`item-fellowship`, #1),
 *   "The Two Towers" (`item-twotowers`, #2), "The Return of the King"
 *   (`item-return`, #3) — deliberately *not* alphabetical order (alphabetically
 *   "Fellowship" < "Return" < "Two", which would put book #3 before book #2).
 *   This is what exercises "the series page trusts the server's order" rather
 *   than a client-side re-sort: an all-null client-derived sequence would
 *   collapse to alphabetical and silently swap #2 and #3.
 * - author "J.R.R. Tolkien" (`author-tolkien`) has four books in the library:
 *   the three "Lord of the Rings" volumes above and "The Hobbit"
 *   (`item-hobbit`, no series) — this is what exercises "an author's page
 *   lists theirs" with more than one book.
 *
 * Series/author results only render once the "Books" primary chip is
 * selected (`searchFilters.ts`'s `ALL_KINDS_VISIBLE` deliberately excludes
 * them from the unfiltered view — see that module's header comment), so
 * every test that expects a series/author result to be visible selects it
 * first, the same way `e2e/app/search-view.spec.ts` does.
 */
import { expect, test, type Page } from '@playwright/test';

/** `Escape` first (wave 16e-search-W) — the typed queries below ("dune", "tolkien") both
 * match a real search suggestion, which opens `SearchField`'s floating dropdown directly
 * over this chip. See `search-view.spec.ts`'s `clickChip` for the full explanation; same
 * fix, same reasoning. */
async function clickBooksChip(page: Page) {
  await page.keyboard.press('Escape');
  await page.getByTestId('search-filter-primary-books').locator('label').first().click();
}

test('a Search "Series" result navigates to the series page, listing its book', async ({
  page,
}) => {
  await page.goto('/search');
  await page.getByTestId('search-field').getByRole('combobox').fill('dune');
  await clickBooksChip(page);

  await page.getByTestId('search-result-series-dune').click();

  await expect(page).toHaveURL(/\/series\/series-dune$/);
  await expect(page.getByTestId('series-name')).toHaveText('Dune');
  await expect(page.getByTestId('series-book-item-dune')).toBeVisible();
});

test('a Search "Authors" result navigates to the author page, listing their books', async ({
  page,
}) => {
  await page.goto('/search');
  await page.getByTestId('search-field').getByRole('combobox').fill('tolkien');
  await clickBooksChip(page);

  await page.getByTestId('search-result-author-tolkien').click();

  await expect(page).toHaveURL(/\/author\/author-tolkien$/);
  await expect(page.getByTestId('author-name')).toHaveText('J.R.R. Tolkien');
  await expect(page.getByTestId('author-book-item-fellowship')).toBeVisible();
  await expect(page.getByTestId('author-book-item-hobbit')).toBeVisible();
});

test("a series book card navigates to that book's item page", async ({ page }) => {
  await page.goto('/series/series-dune');

  await page.getByTestId('series-book-item-dune').click();

  await expect(page).toHaveURL(/\/item\/item-dune$/);
  await expect(page.getByTestId('item-page').getByRole('heading', { name: 'Dune' })).toBeVisible();
});

test("an author book card navigates to that book's item page", async ({ page }) => {
  await page.goto('/author/author-herbert');

  await page.getByTestId('author-book-item-dune').click();

  await expect(page).toHaveURL(/\/item\/item-dune$/);
  await expect(page.getByTestId('item-page')).toBeVisible();
});

// 16e-book-W: the book detail screen's author link (docs/design/screens/BOOK_DETAIL.md
// §5, "Author tap"). Real, matchable ids only exist on GET /items/:id?expanded=true —
// this fixture's own author-herbert/author-tolkien ids are what confirm the link lands
// on the *correct* author page, not merely *an* author page.
test("the book detail page's author name links to that author's own page", async ({ page }) => {
  await page.goto('/item/item-dune');
  await expect(page.getByTestId('item-page')).toBeVisible();

  const authorLink = page.getByTestId('item-author-link');
  await expect(authorLink).toBeVisible();
  await expect(authorLink).toHaveText('Frank Herbert');

  await authorLink.click();

  await expect(page).toHaveURL(/\/author\/author-herbert$/);
  await expect(page.getByTestId('author-name')).toHaveText('Frank Herbert');
  // Confirms this is genuinely a working page, not a dead link that happens to
  // change the URL — the same author's other book is reachable from it.
  await expect(page.getByTestId('author-book-item-dune')).toBeVisible();
});

test('a multi-book series renders in sequence order, not alphabetical order', async ({ page }) => {
  await page.goto('/series/series-lotr');

  await expect(page.getByTestId('series-name')).toHaveText('The Lord of the Rings');
  const cards = page.getByTestId('series-book-cards').locator('[data-testid^="series-book-"]');
  await expect(cards).toHaveCount(3);
  // Sequence order: Fellowship (#1), Two Towers (#2), Return of the King (#3).
  // Alphabetical order would put Return before Two Towers — if this ever
  // regresses to a client-side re-sort of an all-null sequence, it fails here.
  await expect(cards.nth(0)).toHaveAttribute('data-testid', 'series-book-item-fellowship');
  await expect(cards.nth(1)).toHaveAttribute('data-testid', 'series-book-item-twotowers');
  await expect(cards.nth(2)).toHaveAttribute('data-testid', 'series-book-item-return');
});

test('an unknown series id shows a not-found state, not a blank page', async ({ page }) => {
  await page.goto('/series/does-not-exist');

  await expect(page.getByTestId('series-not-found')).toBeVisible();
  await expect(page.getByTestId('series-book-cards')).toHaveCount(0);
});

test('an unknown author id shows a not-found state, not a blank page', async ({ page }) => {
  await page.goto('/author/does-not-exist');

  await expect(page.getByTestId('author-not-found')).toBeVisible();
  await expect(page.getByTestId('author-book-cards')).toHaveCount(0);
});
