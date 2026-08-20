/**
 * The unified search field's typed suggestions — `docs/design/screens/SEARCH.md` §6.2, wave
 * 16e-search-W. `packages/ui/src/components/SearchField.tsx`'s combobox/keyboard/ARIA
 * machinery is already covered by `e2e/ui/search-field.spec.ts` against gallery fixture data;
 * this file covers `SearchPage.tsx`'s own wiring — real suggestions built from the same
 * arrays `browse.spec.ts`/`search-view.spec.ts` already exercise for the results list below.
 *
 * Fixture data reused from `search-view.spec.ts`'s header: "dune" matches both the book
 * "Dune" (`item-dune`) and the series "Dune" (`series-dune`) — one query, two kinds, in the
 * fixed kind order (§6.2: Books before Series), which is exactly what a suggestion-ordering
 * test needs from real data with no mocking.
 *
 * The track-exclusion and cap tests mock their respective search routes
 * (`item-detail.spec.ts`'s `page.route` pattern) rather than hunting for real fixture data
 * that happens to produce nine candidates or a track with a null `albumId` — no fixture track
 * lacks one today, and manufacturing a fixture-level gap for one test would be a bigger,
 * riskier change than mocking the one response `SearchPage.tsx` reads.
 */
import { expect, test } from '@playwright/test';

const FAKE_JELLYFIN_BASE_URL = 'http://fake.jellyfin.local';
const FAKE_JELLYFIN_USERNAME = 'nova';
const FAKE_JELLYFIN_PASSWORD = 'stardust1';

test.beforeEach(async ({ page }) => {
  await page.goto('/search');
  await expect(page.getByTestId('search-page')).toBeVisible();
});

test('typing "dune" opens the suggestion listbox with real content, in kind order', async ({
  page,
}) => {
  const field = page.getByTestId('search-field');
  await field.getByRole('combobox').fill('dune');

  await expect(field.getByRole('listbox')).toBeVisible();
  // Books before Series (§6.2's fixed kind order) — not incidental, since the fixture book
  // and series are both literally named "Dune" and would sort identically alphabetically.
  await expect(field.getByRole('option')).toHaveText(['Dune · Book', 'Dune · Series']);
});

test('selecting a suggestion by click navigates to the right route and updates the field text', async ({
  page,
}) => {
  const field = page.getByTestId('search-field');
  const input = field.getByRole('combobox');
  await input.fill('dune');
  await expect(field.getByRole('option', { name: 'Dune · Book' })).toBeVisible();

  await field.getByRole('option', { name: 'Dune · Book' }).click();

  await expect(page).toHaveURL(/\/item\/item-dune$/);

  // Selection navigates away from `/search` entirely, so the field's updated text can only be
  // observed by coming back to it — exactly the "coherent if the user navigates back" case
  // `searchSuggestions.ts`'s doc comment names. The field's text is the suggestion's plain
  // title ("Dune"), not the typed query ("dune") and not the decorated "Dune · Book" label.
  await page.goBack();
  await expect(page.getByTestId('search-page')).toBeVisible();
  await expect(field.getByRole('combobox')).toHaveValue('Dune');
});

test('selecting a suggestion by keyboard (ArrowDown, Enter) does the same', async ({ page }) => {
  const field = page.getByTestId('search-field');
  const input = field.getByRole('combobox');
  await input.fill('dune');
  // Wait for the real suggestion to actually be there before driving it by keyboard — typing
  // fires the underlying search query asynchronously, and ArrowDown on an as-yet-empty
  // suggestion list is a documented no-op in `SearchField.tsx`.
  await expect(field.getByRole('option', { name: 'Dune · Book' })).toBeVisible();

  // ArrowDown highlights the first suggestion — "Dune · Book" per the fixed kind order.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/item\/item-dune$/);

  await page.goBack();
  await expect(page.getByTestId('search-page')).toBeVisible();
  await expect(field.getByRole('combobox')).toHaveValue('Dune');
});

test('a track with no albumId never appears as a suggestion', async ({ page }) => {
  // Idempotent — Jellyfin's connect state is process-global (search-music.spec.ts's header),
  // and `useJellyfinSearchQuery` is gated on it being configured, so this test must not
  // assume another file has already connected.
  await page.goto('/settings');
  await page.getByTestId('jellyfin-base-url-input').fill(FAKE_JELLYFIN_BASE_URL);
  await page.getByTestId('jellyfin-username-input').fill(FAKE_JELLYFIN_USERNAME);
  await page.getByTestId('jellyfin-password-input').fill(FAKE_JELLYFIN_PASSWORD);
  await page.getByTestId('jellyfin-connect-submit').click();
  await expect(page.getByTestId('jellyfin-status-connected')).toBeVisible();

  // `page.context().route` (not `page.route`) — a route registered on the page right before a
  // navigation has been observed to race the navigation's own protocol setup and silently miss
  // the very first matching request; the context-level route does not.
  await page.context().route('**/api/v1/jellyfin/search*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        artists: [],
        albums: [],
        tracks: [
          {
            id: 'trk-has-album',
            name: 'Has An Album',
            albumId: 'alb-somealbum',
            albumName: 'Some Album',
            artistNames: [],
            trackNumber: null,
            discNumber: null,
            durationSeconds: null,
            imageTag: null,
            genres: [],
            favorite: false,
          },
          {
            id: 'trk-no-album',
            name: 'Has No Album',
            albumId: null,
            albumName: null,
            artistNames: [],
            trackNumber: null,
            discNumber: null,
            durationSeconds: null,
            imageTag: null,
            genres: [],
            favorite: false,
          },
        ],
      }),
    });
  });

  await page.goto('/search');
  const field = page.getByTestId('search-field');
  await field.getByRole('combobox').fill('album-suggestion-probe');

  await expect(field.getByRole('option', { name: 'Has An Album · Track' })).toBeVisible();
  await expect(field.getByRole('option', { name: 'Has No Album · Track' })).toHaveCount(0);
});

test('the suggestion cap holds at 8 against a query matching more than 8 candidates', async ({
  page,
}) => {
  // See the track-exclusion test's comment on why this is `page.context().route`.
  await page.context().route('**/api/v1/libraries/lib-books/search*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        books: Array.from({ length: 9 }, (_, i) => ({
          id: `cap-book-${i}`,
          libraryId: 'lib-books',
          coverPath: null,
          media: { kind: 'book', title: `Cap Test Book ${i}` },
          progress: null,
        })),
        podcasts: [],
        series: [],
        authors: [],
      }),
    });
  });

  await page.goto('/search');
  const field = page.getByTestId('search-field');
  await field.getByRole('combobox').fill('cap test book');

  const options = field.getByRole('option');
  await expect(options).toHaveCount(8);
  // The 9th book (index 8) is the one that must not appear — a cap that silently dropped a
  // different item, or that dropped none at all, would still pass a bare `toHaveCount(8)`.
  await expect(field.getByRole('option', { name: 'Cap Test Book 8 · Book' })).toHaveCount(0);
  await expect(field.getByRole('option', { name: 'Cap Test Book 0 · Book' })).toBeVisible();
});
