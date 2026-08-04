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
  // Signed in already, via the `app` project's `storageState`.
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

test('Books, Podcasts and Settings are offered once a real library backs each one', async ({
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
  const nav = page.getByTestId('nav-rail-expanded');
  await expect(nav.getByRole('button', { name: 'Home' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Books' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Podcasts' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Settings' })).toBeVisible();
  // Search is an always-visible input at the top of the rail (Feishin's
  // pattern), not a destination link in this list — it must not appear as one.
  await expect(nav.getByRole('button', { name: 'Search' })).toHaveCount(0);
});

test('the desktop rail has an always-visible search input, not a Search nav link', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const nav = page.getByTestId('nav-rail-expanded');
  const searchInput = nav.getByRole('combobox', { name: 'Search' });

  await expect(searchInput).toBeVisible();
  await expect(searchInput).toHaveAttribute('placeholder', 'Search');

  await searchInput.fill('dune');
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByTestId('search-field').getByRole('combobox')).toHaveValue('dune');
});

test('the Books destination goes to the library the server actually reported', async ({ page }) => {
  // The id is never hard-coded in the app — it comes from `GET /api/v1/libraries`
  // — so this asserts the wiring, not a constant.
  await page.getByTestId('nav-rail-expanded').getByRole('button', { name: 'Books' }).click();

  await expect(page).toHaveURL(/\/library\/lib-books$/);
  await expect(page.getByTestId('library-page')).toBeVisible();
  await expect(page.getByTestId('library-item-cards')).toBeVisible();
});
