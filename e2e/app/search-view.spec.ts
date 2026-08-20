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
 * real pointer would (`e2e/ui/chip.spec.ts`, `browse.spec.ts`'s sort chips).
 *
 * `Escape` first (wave 16e-search-W): a query that matches a real suggestion opens
 * `SearchField`'s floating dropdown directly over this row, so a chip whose label sits
 * under an open option is genuinely unclickable — not a test artifact, the same is true
 * of a real pointer. That is standard combobox behaviour (Google's own search box has the
 * same property) and the documented way to dismiss it is `Escape`, already wired in
 * `SearchField.tsx`. A no-op when nothing is open. */
async function clickChip(page: Page, testId: string) {
  await page.keyboard.press('Escape');
  await page.getByTestId(testId).locator('label').first().click();
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

/**
 * §12b's "requests" half: library results and requestable results are visually
 * separated, and pressing a requestable item requests it (docs/ROADMAP.md §12b,
 * `searchRequestability.ts`). Configures prowlarr/qbittorrent the same way
 * `requests.spec.ts` does, and slskd the same way `music-requests.spec.ts` does —
 * both idempotent (a save with the same values twice is harmless), so this file
 * doesn't need to assume it runs before or after those files.
 *
 * Same `AURALIS_FAKE_UPSTREAMS` constraint those two files document: there is no
 * fake Prowlarr, qBittorrent or slskd, so every request-search here genuinely
 * fails to reach its provider. That rules out ever seeing a real release or
 * candidate — this file's own "press it to request" coverage is therefore the
 * book "Request anyway" path (`RequestableBooksSection.tsx`), which needs no
 * reachable indexer at all, exactly as `requests.spec.ts`'s own "Request anyway"
 * test does. The per-release/per-candidate "press the item" path (both books and
 * music) is inherently untestable in this environment, same documented gap as
 * `requests.spec.ts` and `music-requests.spec.ts` already carry for the same
 * reason.
 */
test('configuring an indexer, a download client, and a music provider saves without error', async ({
  page,
}) => {
  await page.goto('/settings');
  await expect(page.getByTestId('settings-page')).toBeVisible();

  const prowlarr = page.getByTestId('provider-prowlarr');
  await expect(prowlarr).toBeVisible();
  await prowlarr.getByTestId('provider-prowlarr-baseurl-input').fill('http://prowlarr:9696');
  await prowlarr.getByTestId('provider-prowlarr-secret-apiKey-input').fill('test-api-key');
  await prowlarr.getByTestId('provider-prowlarr-enabled-toggle').check();
  await prowlarr.getByTestId('provider-prowlarr-save').click();
  await expect(prowlarr.getByTestId('provider-prowlarr-save-error')).toHaveCount(0);

  const qbittorrent = page.getByTestId('provider-qbittorrent');
  await expect(qbittorrent).toBeVisible();
  await qbittorrent.getByTestId('provider-qbittorrent-baseurl-input').fill('http://gluetun:8080');
  await qbittorrent.getByTestId('provider-qbittorrent-secret-username-input').fill('admin');
  await qbittorrent.getByTestId('provider-qbittorrent-secret-password-input').fill('test-password');
  await qbittorrent.getByTestId('provider-qbittorrent-enabled-toggle').check();
  await qbittorrent.getByTestId('provider-qbittorrent-save').click();
  await expect(qbittorrent.getByTestId('provider-qbittorrent-save-error')).toHaveCount(0);

  const slskd = page.getByTestId('provider-slskd');
  await expect(slskd).toBeVisible();
  await slskd.getByTestId('provider-slskd-baseurl-input').fill('http://slskd.invalid.local:5030');
  await slskd.getByTestId('provider-slskd-secret-apiKey-input').fill('test-slskd-api-key');
  await slskd.getByTestId('provider-slskd-enabled-toggle').check();
  await slskd.getByTestId('provider-slskd-save').click();
  await expect(slskd.getByTestId('provider-slskd-save-error')).toHaveCount(0);
});

test('a query matching a library book also shows a distinctly-headed "Available to request" group for the same term', async ({
  page,
}) => {
  await page.goto('/search');
  await page.getByTestId('search-field').getByRole('combobox').fill('dune');

  // The library match, under its own "Books" heading — unaffected by this wave.
  await expect(page.getByTestId('search-results-books')).toBeVisible();
  await expect(page.getByTestId('search-result-item-dune')).toBeVisible();

  // The requestable group sits inside the Books section but under its own,
  // differently-worded heading and its own bordered container
  // (`.auralis-requestable-section`) — the "heading and a distinct treatment,
  // not a subtle badge" the spec calls for. No reachable indexer exists in this
  // environment, so this always settles as the title-only "Request anyway"
  // outcome, never a specific release.
  const requestable = page.getByTestId('search-requestable-books');
  await expect(requestable).toBeVisible({ timeout: 10_000 });
  await expect(requestable.locator('h2')).toHaveText('Available to request');
  await expect(requestable).toHaveClass(/auralis-requestable-section/);

  const anywayButton = page.getByTestId('search-requestable-book-anyway-button');
  await expect(anywayButton).toBeVisible();
  await expect(anywayButton).toContainText('dune');
});

test('pressing the requestable "dune" card creates a request and shows "Requested" feedback', async ({
  page,
}) => {
  await page.goto('/search');
  await page.getByTestId('search-field').getByRole('combobox').fill('dune');

  const anywayButton = page.getByTestId('search-requestable-book-anyway-button');
  await expect(anywayButton).toBeVisible({ timeout: 10_000 });
  await anywayButton.click();

  await expect(page.getByTestId('search-requestable-book-anyway-requested')).toBeVisible();
  await expect(page.getByTestId('search-requestable-book-anyway-button')).toHaveCount(0);

  // The same mutation `AskForBookPanel.tsx` uses — confirm it actually landed,
  // not just that the button flipped state client-side.
  await page.goto('/requests');
  await expect(page.getByTestId('requests-list')).toContainText('dune');
});

test('a query matching nothing in the library still offers to request it, with providers enabled', async ({
  page,
}) => {
  // Books requesting is enabled from the earlier test in this file, so this is
  // the "library has nothing, but you can still ask for it" case `AskForBookPanel`'s
  // own "Request anyway" already covers on `/requests` — unified search offers the
  // same outcome. The library section itself must not render a phantom "Books"
  // heading with nothing under it.
  await page.goto('/search');
  await page
    .getByTestId('search-field')
    .getByRole('combobox')
    .fill('completely-unmatched-nonsense-term-zzz');

  await expect(page.getByTestId('search-status')).toContainText('No matches');
  await expect(page.getByTestId('search-results-books')).toContainText('No book matches.');

  const requestable = page.getByTestId('search-requestable-books');
  await expect(requestable).toBeVisible({ timeout: 10_000 });
  await expect(requestable.locator('h2')).toHaveText('Available to request');
  await expect(page.getByTestId('search-requestable-book-anyway-button')).toContainText(
    'completely-unmatched-nonsense-term-zzz',
  );
});

test('music search never shows an empty "Available to request" heading when slskd is unreachable', async ({
  page,
}) => {
  // No fake slskd exists (this file's header comment) — a search always comes
  // back with zero candidates, so the requestable group must not render at all
  // rather than flashing an empty "Available to request" section (§12b: gated
  // on `requestabilitySections`'s own "nothing to show yet" check, mirroring
  // `RequestableBooksSection.tsx`'s reasoning).
  await page.goto('/search');
  await page.getByTestId('search-field').getByRole('combobox').fill('fields');
  await clickChip(page, 'search-filter-primary-music');

  await expect(page.getByTestId('search-results-music-artists')).toBeVisible();
  // Give the debounced request-search time to settle before asserting its
  // absence — otherwise this would pass trivially before the fan-out even fired.
  await page.waitForTimeout(1000);
  await expect(page.getByTestId('search-requestable-music')).toHaveCount(0);
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

test('picking a content-type chip before typing shows no results block at all', async ({
  page,
}) => {
  // A regression, found in review and reachable in two clicks. `requestabilitySections`
  // answers "could this kind be requested on this server", which has nothing to do with
  // whether anything has been searched for — so selecting Books with an empty box used
  // to render an "Available to request" group, and under it "No book matches.", directly
  // beneath the status line still saying "Start typing to search".
  // Configures its own providers rather than inheriting them from the test
  // above. Provider config is process-global BFF state, so inheriting it looks
  // like it works — but under `fullyParallel` this test can run first, and then
  // nothing is requestable, and the assertion below passes for the wrong
  // reason. It did: the first version of this test passed with the fix
  // reverted. Saving the same config twice is idempotent, so this is safe.
  await page.goto('/settings');
  await expect(page.getByTestId('settings-page')).toBeVisible();

  const prowlarr = page.getByTestId('provider-prowlarr');
  await prowlarr.getByTestId('provider-prowlarr-baseurl-input').fill('http://prowlarr:9696');
  await prowlarr.getByTestId('provider-prowlarr-secret-apiKey-input').fill('test-api-key');
  await prowlarr.getByTestId('provider-prowlarr-enabled-toggle').check();
  await prowlarr.getByTestId('provider-prowlarr-save').click();
  await expect(prowlarr.getByTestId('provider-prowlarr-save-error')).toHaveCount(0);

  const qbittorrent = page.getByTestId('provider-qbittorrent');
  await qbittorrent.getByTestId('provider-qbittorrent-baseurl-input').fill('http://gluetun:8080');
  await qbittorrent.getByTestId('provider-qbittorrent-secret-username-input').fill('admin');
  await qbittorrent.getByTestId('provider-qbittorrent-secret-password-input').fill('test-password');
  await qbittorrent.getByTestId('provider-qbittorrent-enabled-toggle').check();
  await qbittorrent.getByTestId('provider-qbittorrent-save').click();
  await expect(qbittorrent.getByTestId('provider-qbittorrent-save-error')).toHaveCount(0);

  await page.goto('/search');
  await clickChip(page, 'search-filter-primary-books');

  await expect(page.getByTestId('search-status')).toContainText('Start typing');
  await expect(page.getByTestId('search-results')).toHaveCount(0);
  await expect(page.getByTestId('search-requestable-books')).toHaveCount(0);
});
