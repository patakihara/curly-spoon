/**
 * Wave 15d-1-books-W: an external (unowned, Open Library-derived) book recommendation on
 * For You — `GET /api/v1/recommended`'s `availability` contract, carried over from wave
 * 15e-books's original `GET /libraries/:id/recommended` version (`docs/HANDOVER.md`). Before
 * this wave the card rendered pixel-identical to an owned book and, tapped, reached
 * `ItemPage`'s generic error boundary for an id no Audiobookshelf instance knows
 * (`external:openlibrary:/works/…`).
 *
 * Mocked via `page.route` (`item-detail.spec.ts`'s pattern) rather than driven through the
 * real external-discovery pipeline: that pipeline calls the live Open Library API
 * (`apps/server/src/features/recommendations/bookExternalDiscovery.ts`), which this wave is
 * forbidden from touching and which no fake-upstream fixture exists for — mocking the one
 * response `HomePage.tsx` actually reads keeps this test fast and network-independent while
 * still exercising the real client-side mapping, rendering and navigation code.
 *
 * Wave 15c-2-W2: re-pointed at `GET /api/v1/recommended`, the cross-medium aggregator For You
 * reads today, replacing the old per-library `GET /libraries/lib-books/recommended` glob. The
 * mocked payload was reshaped to match: the aggregator serializes a flat `MixedRecommendedItem`
 * card projection (`apps/server/src/routes/recommended.ts`) rather than the old per-medium
 * `RecommendedLibraryItem` shape — `kind`/`title` promoted to the top level, `subtitle` a
 * pre-joined author string rather than an `authors[]` array, an added `imageTag` (always `null`
 * for a book), and no `libraryId` or `progress` field at all (the latter is structurally
 * unreachable on any recommended item regardless of shape — see that route's own comments).
 * `availability`'s values and semantics are unchanged, and so is every assertion below.
 */
import { expect, test } from '@playwright/test';

const EXTERNAL_ID = 'external:openlibrary:/works/OL9999999W';
// Wave 15d-1-books-W-2 and the correction that followed it. Two cases pull in opposite
// directions and both matter:
//
//   - A value the client does not RECOGNISE must be treated as external. The old
//     `=== 'external'` comparison read it as owned and dead-ended at `/item/:id` for an id
//     Audiobookshelf has never heard of — the failure this whole feature exists to close.
//   - A MISSING field must be treated as OWNED. `availability` is optional on the shared
//     item interface and an ordinary Audiobookshelf book carries none at all, so reading
//     absent as external marks the user's entire library "not in your library". That
//     regression shipped briefly, from transliterating Android's `!= "owned"` — Android
//     route-scopes the field to a model where it is required, and web does not.
const UNRECOGNISED_ID = 'external:openlibrary:/works/OL8888888W';
const MISSING_FIELD_ID = 'external:openlibrary:/works/OL7777777W';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/recommended*', async (route) => {
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
            // No `itemLabels`: this shelf is all-`book`, and a map whose keys match no
            // rendered card is a trap this project has already paid for once (`a1c0075`).
            items: [
              {
                kind: 'book',
                id: EXTERNAL_ID,
                title: 'The Unwritten Verse',
                subtitle: 'Rowan Ashcombe',
                coverPath: null,
                imageTag: null,
                availability: 'external',
              },
              {
                kind: 'book',
                id: UNRECOGNISED_ID,
                title: 'The Cartographer of Silence',
                subtitle: 'Idris Farrow',
                coverPath: null,
                imageTag: null,
                availability: 'not-a-real-value',
              },
              {
                kind: 'book',
                id: MISSING_FIELD_ID,
                title: 'The Hollow Meridian',
                subtitle: 'Elowen Cray',
                coverPath: null,
                imageTag: null,
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
  // only place a screen reader user learns this — `cardLabel()`'s book-agnostic suffix.
  // Wave 16e-foryou-W made that suffix "not in library", per FOR_YOU.md §6.3: the same
  // concept had four different spellings across the two clients, and Sonora's own literal
  // is canonical. Only the wording moved; the owned-vs-external rule this file guards is
  // untouched.
  await expect(card).toHaveAccessibleName('The Unwritten Verse, Rowan Ashcombe, not in library');

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

test('a present but unrecognised availability value is treated as external, not owned', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('home-page')).toBeVisible();

  const card = page.getByTestId(`shelf-item-${UNRECOGNISED_ID}`);
  await expect(card).toBeVisible();

  // Badged exactly like the recognised-`'external'` case, not silently rendered as owned.
  await expect(page.getByTestId(`shelf-item-${UNRECOGNISED_ID}-external-badge`)).toHaveText(
    'Not in library',
  );
  await expect(card).toHaveAccessibleName(
    'The Cartographer of Silence, Idris Farrow, not in library',
  );

  // Routes to the request flow, never to `/item/:id`.
  await card.click();
  await expect(page).toHaveURL(/\/requests/);
  await expect(page.getByTestId('requests-page')).toBeVisible();
  await expect(page.getByTestId('request-search-field').locator('input')).toHaveValue(
    'The Cartographer of Silence',
  );
  await expect(page.getByTestId('request-search-author-input')).toHaveValue('Idris Farrow');
});

test('an item with NO availability field is treated as owned — the ordinary library case', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('home-page')).toBeVisible();

  const card = page.getByTestId(`shelf-item-${MISSING_FIELD_ID}`);
  await expect(card).toBeVisible();

  // The regression this pins: reading absent as external badges every owned book in the
  // library and sends every tap to the request flow. Nothing else in the suite states this
  // rule directly — it was caught by `tablet-breakpoint.spec.ts` asserting that clicking Dune
  // opens `/item/item-dune`, which names neither `availability` nor the inference.
  await expect(page.getByTestId(`shelf-item-${MISSING_FIELD_ID}-external-badge`)).toHaveCount(0);
  await expect(card).toHaveAccessibleName('The Hollow Meridian, Elowen Cray');
});
