/**
 * The book-requests surfaces: configuring providers, the "ask for a book"
 * search's partial-failure notice, and queuing a title with no release
 * attached ("Request anyway") through to it showing up in the request list.
 *
 * `GET /api/v1/providers`'s fixture descriptors declare `apiKey` as `prowlarr`'s
 * one secret field (API-key auth, matching Prowlarr's real scheme) and
 * `username`/`password` as `qbittorrent`'s two (its WebUI's real scheme) — not a
 * guess, this is what the real descriptors return.
 *
 * `AURALIS_FAKE_UPSTREAMS` (see `docker-smoke.sh`/CI) only swaps in a fake
 * Audiobookshelf (`createFakeAbsUpstream()`); there is no fake Prowlarr and no
 * fake qBittorrent. So however a provider's base URL is configured in this
 * environment, it is genuinely unreachable, and `GET /requests/search` always
 * comes back with `releases: []` and a non-empty `errors` array — never an
 * actual release to click the per-release "Request" button on. That makes two
 * things exercisable here, both without needing a working indexer:
 *
 * - The error-notice path: a broken indexer must not look identical to "your
 *   indexers have nothing", per the spec's most-confusing-failure-mode note.
 * - "Request anyway" (`AskForBookPanel`, enabling rule in `requestAnyway.ts`):
 *   it queues the typed title via `POST /requests` with no `release`, which
 *   needs no reachable indexer at all — this is what restores create-and-list
 *   coverage that the release-attached path structurally cannot provide here.
 *
 * The per-release "Request" button and its "Requested" chip remain untested
 * in this file — no fixture makes a release reachable to click it on.
 *
 * These tests share BFF state deliberately (the BFF is single-tenant and
 * stateful, per `docs/HANDOVER.md`): later tests only mean anything once the
 * first has configured and enabled both providers. Playwright's
 * `fullyParallel: true` (`playwright.config.ts`) parallelises tests *within* a
 * file by default, which would race that dependency, so this file opts into
 * `serial` mode explicitly — unlike the rest of `e2e/app`, whose tests don't
 * depend on each other's state and so don't need it.
 */
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  // Signed in already, via the `app` project's `storageState`.
  await page.goto('/settings');
  await expect(page.getByTestId('settings-page')).toBeVisible();
});

test('configuring an indexer and a download client saves without error', async ({ page }) => {
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
});

test('the Requests destination appears in navigation once both providers are enabled', async ({
  page,
}) => {
  // Scoped to whichever nav container this viewport renders (Shell.tsx picks
  // nav-bar/nav-rail/nav-rail-expanded by breakpoint) — not to the page body,
  // which after the previous test also contains an unrelated "Requests" h2 and
  // hint text in `RequestSettingsSection`/`ProviderSettingsSection`.
  const nav = page.locator(
    '[data-testid="nav-bar"], [data-testid="nav-rail"], [data-testid="nav-rail-expanded"]',
  );
  await expect(nav.getByText('Requests', { exact: true })).toBeVisible();
});

test('an unreachable indexer surfaces a non-blocking error notice, not "no results"', async ({
  page,
}) => {
  // `prowlarr` was pointed at a real-looking but unreachable address in the
  // first test and is enabled — exactly the "half-broken setup" the spec warns
  // hiding the error would misrepresent as an empty library.
  await page.goto('/requests');
  await expect(page.getByTestId('requests-page')).toBeVisible();

  await page.getByTestId('request-search-field').getByRole('combobox').fill('dune');
  await page.getByTestId('request-search-submit').click();

  await expect(page.getByTestId('request-search-errors')).toBeVisible();
  await expect(page.getByText('No releases found for "dune".')).toHaveCount(0);
  // The same zero-releases outcome is also where "Request anyway" lives —
  // exercised end to end by the next test, from a fresh search.
  await expect(page.getByTestId('request-anyway')).toBeVisible();
});

test('"Request anyway" queues the typed title, and it shows up in "Your requests"', async ({
  page,
}) => {
  await page.goto('/requests');
  await expect(page.getByTestId('requests-page')).toBeVisible();

  const title = 'a title no indexer has';
  await page.getByTestId('request-search-field').getByRole('combobox').fill(title);
  await page.getByTestId('request-search-submit').click();

  await expect(page.getByTestId('request-anyway')).toBeVisible();
  await page.getByTestId('request-anyway').click();
  await expect(page.getByTestId('request-anyway-requested')).toBeVisible();

  const list = page.getByTestId('requests-list');
  await expect(list).toBeVisible();
  await expect(list.getByText(title)).toBeVisible();
});
