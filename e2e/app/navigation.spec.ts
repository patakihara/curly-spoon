/**
 * The adaptive shell, at real viewport widths.
 *
 * `apps/web/src/hooks/breakpoint.ts` unit-tests the width→breakpoint mapping as
 * pure arithmetic; what it cannot test is whether the app actually *renders*
 * the right chrome, because the repo has no DOM environment for unit tests and
 * `useBreakpoint` wires the mapping to `matchMedia`. That half lives here — the
 * only place a real `matchMedia` exists. The boundaries under test are the M3
 * ones: < 600 bottom bar, 600–1240 rail, > 1240 expanded rail.
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Signed in already, via the `app` project's `storageState`. `/` is now the
  // "For you" destination (docs/ROADMAP.md §12a) — it still renders
  // `HomePage`/`home-page`, only the nav label and destination key changed.
  await page.goto('/');
  await expect(page.getByTestId('home-page')).toBeVisible();
});

test('a phone-width window puts navigation in a bottom bar', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 900 });

  await expect(page.getByTestId('shell')).toHaveAttribute('data-breakpoint', 'compact');
  await expect(page.getByTestId('nav-bar')).toBeVisible();
  await expect(page.getByTestId('nav-rail')).toHaveCount(0);
  await expect(page.getByTestId('nav-rail-expanded')).toHaveCount(0);
  // Now Playing is a persistent side panel only where there is room for one.
  await expect(page.getByTestId('now-playing-panel')).toHaveCount(0);
});

test('a tablet-width window uses a collapsed rail', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });

  await expect(page.getByTestId('shell')).toHaveAttribute('data-breakpoint', 'medium');
  await expect(page.getByTestId('nav-rail')).toBeVisible();
  await expect(page.getByTestId('nav-bar')).toHaveCount(0);
  await expect(page.getByTestId('nav-rail-expanded')).toHaveCount(0);
  await expect(page.getByTestId('now-playing-panel')).toHaveCount(0);
});

test('a desktop-width window expands the rail and shows Now Playing', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });

  await expect(page.getByTestId('shell')).toHaveAttribute('data-breakpoint', 'expanded');
  await expect(page.getByTestId('nav-rail-expanded')).toBeVisible();
  await expect(page.getByTestId('nav-bar')).toHaveCount(0);
  await expect(page.getByTestId('now-playing-panel')).toBeVisible();
});

test('resizing across a boundary swaps the chrome without a reload', async ({ page }) => {
  // The hook subscribes to `matchMedia`; a layout that only reads the width once
  // at mount would pass every test above and still be wrong when a desktop
  // window is dragged narrow, or a tablet rotated.
  await page.setViewportSize({ width: 1400, height: 900 });
  await expect(page.getByTestId('nav-rail-expanded')).toBeVisible();

  await page.setViewportSize({ width: 480, height: 900 });
  await expect(page.getByTestId('nav-bar')).toBeVisible();
  await expect(page.getByTestId('nav-rail-expanded')).toHaveCount(0);

  await page.setViewportSize({ width: 900, height: 900 });
  await expect(page.getByTestId('nav-rail')).toBeVisible();
  await expect(page.getByTestId('nav-bar')).toHaveCount(0);
});

test('For you, Books and Podcasts are offered once a real library backs each one, and Settings is not among them', async ({
  page,
}) => {
  // "Never show a section that will only error" (apps/web/src/components/
  // destinations.ts): Books and Podcasts are offered because a real library of
  // each media type came back from the server.
  //
  // Music (Jellyfin) used to be asserted absent here too, back when this
  // phase's BFF had no Jellyfin configuration surface at all. It does now
  // (Phase 9 wave A) — `e2e/app/music.spec.ts` owns that assertion instead,
  // in both directions (absent while unconfigured, present once connected),
  // because Jellyfin's config is process-global state
  // (`GET/POST /api/v1/jellyfin/config`) that only that file mutates. This
  // file must not also assert a fixed Music state: under `fullyParallel`
  // (`playwright.config.ts`), music.spec.ts connecting Jellyfin in another
  // worker while this test runs would make either direction flaky depending
  // on timing.
  // Scoped to the destination list specifically, not the whole rail — the
  // rail also renders the always-visible search input and the Settings
  // footer link, neither of which is one of the five primary destinations.
  const nav = page.getByTestId('nav-rail-destinations');
  await expect(nav.getByRole('button', { name: 'For you' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Books' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Podcasts' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Settings', exact: true })).toHaveCount(0);
  // Search is an always-visible input at the top of the rail (Feishin's
  // pattern), not a destination link in this list — it must not appear as one.
  await expect(nav.getByRole('button', { name: 'Search' })).toHaveCount(0);
});

test('the destinations render in order — For you first, in the expanded rail', async ({ page }) => {
  // This intentionally does not connect Jellyfin to also pin Music's position
  // in the middle: Jellyfin's config is process-global BFF state
  // (`GET/POST /api/v1/jellyfin/config`), and `music.spec.ts` is the one file
  // that owns mutating it — concurrently, under `fullyParallel`, in another
  // worker of this very run, per its own doc comment. That means Music's
  // *presence* in this rail is not under this test's control even though this
  // test never touches it itself, so the assertion below tolerates either
  // state rather than asserting a fixed list — the first version of this test
  // asserted an exact three-item list and flaked under real parallel load
  // exactly as `music.spec.ts`'s comment predicted. The full five-key order —
  // including exactly where Music sits once configured — is pinned instead by
  // the unconditional unit test in `components/destinations.test.ts`.
  //
  // Search itself never renders as a rail *button* at all (it's the always-on
  // search input above the destination list, asserted by the test below), so
  // "Search last" isn't a meaningful assertion to make about this particular
  // list — the compact bottom bar's own test below is where that holds.
  await page.setViewportSize({ width: 1400, height: 900 });
  const nav = page.getByTestId('nav-rail-destinations');
  const labels = (await nav.getByRole('button').allTextContents()).filter((l) => l !== 'Music');
  expect(labels).toEqual(['For you', 'Books', 'Podcasts']);
});

test('the compact bottom bar puts Search last, on the far right', async ({ page }) => {
  // Same Music-is-process-global caveat as the rail test above — filter it
  // out rather than assume it absent.
  await page.setViewportSize({ width: 480, height: 900 });
  const nav = page.getByTestId('nav-bar');
  const labels = (await nav.getByRole('button').allTextContents()).filter((l) => l !== 'Music');
  expect(labels[labels.length - 1]).toBe('Search');
  expect(labels).toEqual(['For you', 'Books', 'Podcasts', 'Search']);
});

test('the desktop rail has an always-visible search input at the top, not a Search nav link', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const nav = page.getByTestId('nav-rail-expanded');
  const searchInput = nav.getByRole('combobox', { name: 'Search' });

  await expect(searchInput).toBeVisible();
  await expect(searchInput).toHaveAttribute('placeholder', 'Search');

  // "At the top" — above every real nav destination below it.
  const searchBox = await page.getByTestId('nav-rail-search').boundingBox();
  const forYouBox = await nav.getByRole('button', { name: 'For you' }).boundingBox();
  if (!searchBox || !forYouBox) throw new Error('search field or For you link not visible');
  expect(searchBox.y).toBeLessThan(forYouBox.y);

  await searchInput.fill('dune');
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByTestId('search-field').getByRole('combobox')).toHaveValue('dune');
});

test('Settings stays reachable from the rail footer, though it is not one of the five destinations', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const settingsLink = page.getByTestId('nav-rail-settings');
  await expect(settingsLink).toBeVisible();
  await expect(settingsLink).toHaveText('Settings');

  await settingsLink.click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId('settings-page')).toBeVisible();
  await expect(settingsLink).toHaveAttribute('aria-current', 'page');
});

test('Settings stays reachable on a phone-width window via its own fixed button', async ({
  page,
}) => {
  await page.setViewportSize({ width: 480, height: 900 });
  const settingsButton = page.getByTestId('compact-settings-button');
  await expect(settingsButton).toBeVisible();

  await settingsButton.click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId('settings-page')).toBeVisible();
});

test('the Books and Podcasts destinations go to the libraries the server actually reported', async ({
  page,
}) => {
  // The ids are never hard-coded in the app — they come from
  // `GET /api/v1/libraries` — so this asserts the wiring, not a constant.
  await page.getByTestId('nav-rail-expanded').getByRole('button', { name: 'Books' }).click();

  await expect(page).toHaveURL(/\/books$/);
  await expect(page.getByTestId('books-page')).toBeVisible();
  await expect(page.getByTestId('library-page')).toBeVisible();
  await expect(page.getByTestId('library-item-cards')).toBeVisible();

  await page.getByTestId('nav-rail-expanded').getByRole('button', { name: 'Podcasts' }).click();

  await expect(page).toHaveURL(/\/podcasts$/);
  await expect(page.getByTestId('podcasts-page')).toBeVisible();
  await expect(page.getByTestId('library-page')).toBeVisible();

  // The old, library-id-bearing path still works too — nothing that already
  // links to it should break.
  await page.goto('/library/lib-books');
  await expect(page.getByTestId('library-page')).toBeVisible();
  await expect(page.getByTestId('library-item-cards')).toBeVisible();
});

test("the desktop rail's active destination renders its fillable icon filled, inactive outlined", async ({
  page,
}) => {
  // Wave 16d-W-2: `Icon`'s `filled` prop (shipped in 17a3d0e) finally gets a
  // reader — the Material Symbols FILL axis, selected destination filled,
  // unselected outlined (`docs/design/SONORA.md` §3.7). `book_2` (Books) is
  // deliberately the glyph under test here, not `podcasts` or `search`:
  // both of those are pixel-identical in their filled and outlined forms
  // (`Icon.tsx`'s own comment — neither glyph has an enclosed region for the
  // FILL axis to change), so an assertion built on either would pass whether
  // or not the wiring actually worked. `book_2` is real, visible movement.
  const nav = page.getByTestId('nav-rail-destinations');
  const booksIconPath = nav.getByRole('button', { name: 'Books' }).locator('svg.m3-icon path');

  // For you is active by default (`beforeEach` navigates to `/`) — Books is
  // not, so its icon renders in its outlined form.
  const outlinedD = await booksIconPath.getAttribute('d');
  expect(outlinedD).toBeTruthy();

  await nav.getByRole('button', { name: 'Books' }).click();
  await expect(page).toHaveURL(/\/books$/);

  const filledD = await booksIconPath.getAttribute('d');
  expect(filledD).toBeTruthy();
  expect(filledD).not.toBe(outlinedD);
});

test("the compact bottom bar's active destination also renders its fillable icon filled", async ({
  page,
}) => {
  // Same wiring, the other of the two surfaces `navItems` (`Shell.tsx`)
  // feeds — the compact `NavigationBar` reads the identical `item.icon`
  // built for the rail, so this is the parity half of the test above rather
  // than a second, independent implementation to drift from it.
  await page.setViewportSize({ width: 480, height: 900 });
  const nav = page.getByTestId('nav-bar');
  const booksIconPath = nav.getByRole('button', { name: 'Books' }).locator('svg.m3-icon path');

  const outlinedD = await booksIconPath.getAttribute('d');
  expect(outlinedD).toBeTruthy();

  await nav.getByRole('button', { name: 'Books' }).click();
  await expect(page).toHaveURL(/\/books$/);

  const filledD = await booksIconPath.getAttribute('d');
  expect(filledD).toBeTruthy();
  expect(filledD).not.toBe(outlinedD);
});
