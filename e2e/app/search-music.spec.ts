/**
 * Unified search once Jellyfin is in the mix: the same `/search` page
 * `browse.spec.ts` already covers for books/podcasts, extended here with
 * artist/album/track results and the status-line wording that comes with
 * them.
 *
 * Fixture data reused from `apps/server/src/testSupport/fakes/fakeJellyfin.ts`
 * (see `music.spec.ts`'s header for the full rundown): "Echo Fields" (artist)
 * and "Hollow Fields" (album) both contain "fields", so a single search term
 * exercises the artist and album subsections together; "tidal" matches only
 * the track "Tidal Lines" (on album "Driftwave"), so it exercises the track
 * subsection and the track→album-page navigation on its own.
 *
 * Jellyfin's connect state is process-global, not scoped to the signed-in
 * session (`music.spec.ts`'s header explains why), so — like that file — this
 * one runs `serial`: the first test asserts the still-unconfigured state
 * before anything here has connected Jellyfin, and every later test relies on
 * the connection the second test establishes.
 */
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const FAKE_JELLYFIN_BASE_URL = 'http://fake.jellyfin.local';
const FAKE_JELLYFIN_USERNAME = 'nova';
const FAKE_JELLYFIN_PASSWORD = 'stardust1';

test('no music section renders while Jellyfin is unconfigured, even for a matching term', async ({
  page,
}) => {
  // Signed in already, via the `app` project's `storageState`.
  await page.goto('/settings');
  await expect(page.getByTestId('jellyfin-status-disconnected')).toBeVisible();

  await page.goto('/search');
  await page.getByTestId('search-field').getByRole('combobox').fill('dune');

  await expect(page.getByTestId('search-results-books')).toBeVisible();
  await expect(page.getByTestId('search-result-item-dune')).toBeVisible();
  await expect(page.getByTestId('search-results-music')).toHaveCount(0);

  // The status line stays in its original two-part shape — no music mention,
  // no fired-and-discarded Jellyfin request to reason about.
  await expect(page.getByTestId('search-status')).toContainText(
    '1 book, 0 podcasts found for "dune".',
  );
});

test('connecting Jellyfin from Settings', async ({ page }) => {
  await page.goto('/settings');
  await page.getByTestId('jellyfin-base-url-input').fill(FAKE_JELLYFIN_BASE_URL);
  await page.getByTestId('jellyfin-username-input').fill(FAKE_JELLYFIN_USERNAME);
  await page.getByTestId('jellyfin-password-input').fill(FAKE_JELLYFIN_PASSWORD);
  await page.getByTestId('jellyfin-connect-submit').click();

  await expect(page.getByTestId('jellyfin-status-connected')).toBeVisible();
});

test('a term matching an artist and an album shows both subsections, and the status line counts them', async ({
  page,
}) => {
  await page.goto('/search');
  await page.getByTestId('search-field').getByRole('combobox').fill('fields');

  await expect(page.getByTestId('search-results-music')).toBeVisible();
  await expect(page.getByTestId('search-results-music-artists')).toBeVisible();
  await expect(page.getByTestId('search-result-artist-echo')).toContainText('Echo Fields');
  await expect(page.getByTestId('search-results-music-albums')).toBeVisible();
  await expect(page.getByTestId('search-result-album-hollow')).toContainText('Hollow Fields');

  // No track named "fields" in the fixture — the subsection is omitted
  // entirely rather than rendered empty.
  await expect(page.getByTestId('search-results-music-tracks')).toHaveCount(0);

  await expect(page.getByTestId('search-status')).toContainText(
    '0 books, 0 podcasts, 1 artist, 1 album, 0 tracks found for "fields".',
  );
});

test('a term matching only a track shows the track subsection, and clicking it opens the album', async ({
  page,
}) => {
  await page.goto('/search');
  await page.getByTestId('search-field').getByRole('combobox').fill('tidal');

  await expect(page.getByTestId('search-results-music-tracks')).toBeVisible();
  await expect(page.getByTestId('search-results-music-artists')).toHaveCount(0);
  await expect(page.getByTestId('search-results-music-albums')).toHaveCount(0);

  const trackResult = page.getByTestId('search-result-track-driftwave-1');
  await expect(trackResult).toContainText('Tidal Lines');

  await trackResult.click();

  await expect(page).toHaveURL(/\/music\/album\/album-driftwave$/);
  await expect(page.getByTestId('music-album-page')).toBeVisible();
  await expect(page.getByTestId('music-album-name')).toHaveText('Driftwave');
});

test('clicking an album search result navigates straight to that album', async ({ page }) => {
  await page.goto('/search');
  await page.getByTestId('search-field').getByRole('combobox').fill('driftwave');

  const albumResult = page.getByTestId('search-result-album-driftwave');
  await expect(albumResult).toContainText('Driftwave');

  await albumResult.click();

  await expect(page).toHaveURL(/\/music\/album\/album-driftwave$/);
  await expect(page.getByTestId('music-album-page')).toBeVisible();
});
