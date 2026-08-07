/**
 * Series and author detail pages (docs/agent-specs/04-phase12c1…): a Search
 * "Series"/"Authors" result now navigates somewhere, the books on each page
 * render in the right order, and an unknown id degrades to a real not-found
 * state rather than a blank page.
 *
 * Fixture data (`apps/server/src/testSupport/fakes/fixtures`):
 * - series "Dune" (`series-dune`) has one member, the book "Dune" (`item-dune`,
 *   author "Frank Herbert" / `author-herbert`).
 * - series "The Lord of the Rings" (`series-lotr`) has one member, "The
 *   Fellowship of the Ring" (`item-fellowship`).
 * - author "J.R.R. Tolkien" (`author-tolkien`) has two books in the library:
 *   "The Fellowship of the Ring" (in `series-lotr`) and "The Hobbit"
 *   (`item-hobbit`, no series) — this is what exercises "an author's page lists
 *   theirs" with more than one book, since neither fixture series has more than
 *   one member.
 */
import { expect, test } from '@playwright/test';

test('a Search "Series" result navigates to the series page, listing its book', async ({
  page,
}) => {
  await page.goto('/search');
  await page.getByTestId('search-field').getByRole('combobox').fill('dune');

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

  await page.getByTestId('search-result-author-tolkien').click();

  await expect(page).toHaveURL(/\/author\/author-tolkien$/);
  await expect(page.getByTestId('author-name')).toHaveText('J.R.R. Tolkien');
  await expect(page.getByTestId('author-book-item-fellowship')).toBeVisible();
  await expect(page.getByTestId('author-book-item-hobbit')).toBeVisible();
});

test('a series book card navigates to that book\'s item page', async ({ page }) => {
  await page.goto('/series/series-dune');

  await page.getByTestId('series-book-item-dune').click();

  await expect(page).toHaveURL(/\/item\/item-dune$/);
  await expect(page.getByTestId('item-page').getByRole('heading', { name: 'Dune' })).toBeVisible();
});

test('an author book card navigates to that book\'s item page', async ({ page }) => {
  await page.goto('/author/author-herbert');

  await page.getByTestId('author-book-item-dune').click();

  await expect(page).toHaveURL(/\/item\/item-dune$/);
  await expect(page.getByTestId('item-page')).toBeVisible();
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
