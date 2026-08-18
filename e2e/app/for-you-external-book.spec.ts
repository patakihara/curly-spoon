/**
 * Wave 15d-1-books-W: an external (unowned, Open Library-derived) book recommendation on
 * For You — `GET /libraries/:id/recommended`'s wave 15e-books `availability` contract
 * (`docs/HANDOVER.md`). Before this wave the card rendered pixel-identical to an owned book
 * and, tapped, reached `ItemPage`'s generic error boundary for an id no Audiobookshelf
 * instance knows (`external:openlibrary:/works/…`).
 *
 * Mocked via `page.route` (`item-detail.spec.ts`'s pattern) rather than driven through the
 * real external-discovery pipeline: that pipeline calls the live Open Library API
 * (`apps/server/src/features/recommendations/bookExternalDiscovery.ts`), which this wave is
 * forbidden from touching and which no fake-upstream fixture exists for — mocking the one
 * response `HomePage.tsx` actually reads keeps this test fast and network-independent while
 * still exercising the real client-side mapping, rendering and navigation code.
 */
import { expect, test } from '@playwright/test';

const EXTERNAL_ID = 'external:openlibrary:/works/OL9999999W';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/libraries/lib-books/recommended*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        shelves: [
          {
            id: 'rec-external-books',
            label: 'More books to discover',
            type: 'discover',
            reason: 'Because you enjoy Fantasy',
            items: [
              {
                id: EXTERNAL_ID,
                libraryId: 'lib-books',
                coverPath: null,
                media: {
                  kind: 'book',
                  title: 'The Unwritten Verse',
                  authors: [{ name: 'Rowan Ashcombe' }],
                },
                progress: null,
                availability: 'external',
              },
            ],
          },
        ],
      }),
    });
  });
});

test('an external recommended book carries a "not in library" badge, announces it, and taps into the request flow pre-filled', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('home-page')).toBeVisible();

  const card = page.getByTestId(`shelf-item-${EXTERNAL_ID}`);
  await expect(card).toBeVisible();

  // Visual: the pill this wave's Carousel.tsx already renders generically for any
  // `availability === 'external'` item, regardless of content type.
  await expect(page.getByTestId(`shelf-item-${EXTERNAL_ID}-external-badge`)).toHaveText(
    'Not in library',
  );

  // Accessibility: the pill is `aria-hidden`, so the card's own accessible name is the
  // only place a screen reader user learns this — `cardLabel()`'s existing, book-agnostic
  // "not in your library" suffix.
  await expect(card).toHaveAccessibleName(
    'The Unwritten Verse, Rowan Ashcombe, not in your library',
  );

  // Tap: goes to the book request flow, pre-filled, never to /item/:id (the dead end).
  await card.click();
  await expect(page).toHaveURL(/\/requests/);
  await expect(page.getByTestId('requests-page')).toBeVisible();
  await expect(page.getByTestId('request-search-field').locator('input')).toHaveValue(
    'The Unwritten Verse',
  );
  await expect(page.getByTestId('request-search-author-input')).toHaveValue('Rowan Ashcombe');

  // No auto-submit: unlike /music/requests' `?prefill=`, landing here must not have fired a
  // search on its own — no results panel, no "no releases found" panel, no "Searching…".
  await expect(page.getByTestId('request-search-results')).toHaveCount(0);
  await expect(page.getByTestId('request-anyway-panel')).toHaveCount(0);
  await expect(page.getByText('Searching…')).toHaveCount(0);
});

test('an owned recommended book (availability absent from other shelves) is unaffected: no badge, navigates to its item page', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('home-page')).toBeVisible();

  // item-dune is a real fixture book with an ordinary (non-recommended) shelf entry —
  // proves the badge/redirect logic is conditional on `availability === 'external'`, not
  // something that now fires for every book card.
  const ownedCard = page.getByTestId('shelf-item-item-dune');
  await expect(ownedCard).toBeVisible();
  await expect(page.getByTestId('shelf-item-item-dune-external-badge')).toHaveCount(0);

  await ownedCard.click();
  await expect(page).toHaveURL(/\/item\/item-dune/);
  await expect(page.getByTestId('item-page')).toBeVisible();
});
