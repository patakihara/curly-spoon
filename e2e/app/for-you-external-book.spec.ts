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
// Wave 15d-1-books-W-2: a value the client does not recognise, and a missing field —
// both must still be treated as external (`availability !== 'owned'`), not as owned. Before
// this wave the inference was `=== 'external'`, so both of these silently rendered as
// ordinary owned books and dead-ended at `/item/:id` for an id Audiobookshelf has never
// heard of, which is exactly the failure this whole feature exists to close.
const UNRECOGNISED_ID = 'external:openlibrary:/works/OL8888888W';
const MISSING_FIELD_ID = 'external:openlibrary:/works/OL7777777W';

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
              {
                id: UNRECOGNISED_ID,
                libraryId: 'lib-books',
                coverPath: null,
                media: {
                  kind: 'book',
                  title: 'The Cartographer of Silence',
                  authors: [{ name: 'Idris Farrow' }],
                },
                progress: null,
                availability: 'not-a-real-value',
              },
              {
                id: MISSING_FIELD_ID,
                libraryId: 'lib-books',
                coverPath: null,
                media: {
                  kind: 'book',
                  title: 'The Hollow Meridian',
                  authors: [{ name: 'Elowen Cray' }],
                },
                progress: null,
                // `availability` deliberately absent.
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
  // non-owned (`availability !== 'owned'`) item, regardless of content type.
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
  // proves the badge/redirect logic is conditional on `availability !== 'owned'`, not
  // something that now fires for every book card.
  const ownedCard = page.getByTestId('shelf-item-item-dune');
  await expect(ownedCard).toBeVisible();
  await expect(page.getByTestId('shelf-item-item-dune-external-badge')).toHaveCount(0);

  await ownedCard.click();
  await expect(page).toHaveURL(/\/item\/item-dune/);
  await expect(page.getByTestId('item-page')).toBeVisible();
});

test('an unrecognised or missing availability value is treated as external, not owned (the fail-unsafe case)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('home-page')).toBeVisible();

  for (const [id, title, author] of [
    [UNRECOGNISED_ID, 'The Cartographer of Silence', 'Idris Farrow'],
    [MISSING_FIELD_ID, 'The Hollow Meridian', 'Elowen Cray'],
  ] as const) {
    const card = page.getByTestId(`shelf-item-${id}`);
    await expect(card).toBeVisible();

    // Badged exactly like the recognised-`'external'` case, not silently rendered as owned.
    await expect(page.getByTestId(`shelf-item-${id}-external-badge`)).toHaveText('Not in library');
    await expect(card).toHaveAccessibleName(`${title}, ${author}, not in your library`);

    // Routes to the request flow, never to `/item/:id` — the dead end this whole feature
    // exists to close. Before 15d-1-books-W-2's `!== 'owned'` fix this would have hit
    // `/item/:id` for an id no Audiobookshelf instance has ever heard of.
    await card.click();
    await expect(page).toHaveURL(/\/requests/);
    await expect(page.getByTestId('requests-page')).toBeVisible();
    await expect(page.getByTestId('request-search-field').locator('input')).toHaveValue(title);
    await expect(page.getByTestId('request-search-author-input')).toHaveValue(author);

    // Back to Home for the next iteration.
    await page.goto('/');
    await expect(page.getByTestId('home-page')).toBeVisible();
  }
});
