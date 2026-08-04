/**
 * Music (Phase 9 wave A): connecting Jellyfin from Settings, browsing
 * artists → albums → tracks, and searching across all three. Wave B (see
 * `docs/HANDOVER.md`) adds playback — tests for that are at the end of this
 * file, after the browse/search tests below, so they run once a Jellyfin
 * connection is already established by the earlier tests in this `serial`
 * suite.
 *
 * Fixture data (`apps/server/src/testSupport/fakes/fakeJellyfin.ts`):
 * - Artists: "The Nebula Collective" (`artist-nebula`, 2 albums), "Echo Fields"
 *   (`artist-echo`, 1 album) — 2 total, so the browse grid never has a second
 *   page at this wave's page size (40); the pagination controls are asserted
 *   present-but-inert rather than exercised across a real page boundary.
 * - Albums: "Driftwave" (`album-driftwave`, artist-nebula, 2 tracks),
 *   "Nightglass" (`album-nightglass`, artist-nebula, **0 tracks** — the
 *   fixture's only track-less album, used below for the empty-album state),
 *   "Hollow Fields" (`album-hollow`, artist-echo, 1 track).
 * - Tracks: "Tidal Lines" (214s → 3:34) and "Static Coast" (198s → 3:18), both
 *   on Driftwave.
 *
 * Jellyfin's own settings row is process-global (`GET/POST /jellyfin/config`,
 * `routes/jellyfin.ts`), not scoped to the signed-in Auralis session — the
 * same "BFF is single-tenant and stateful" fact `requests.spec.ts` and
 * `onboarding.spec.ts` are built around (`docs/HANDOVER.md` §4). So, like
 * `requests.spec.ts`, this file opts into `serial` mode: the first tests
 * establish the unconfigured state and then connect, and every later test
 * depends on that connection already being in place.
 */
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  // Playing a track needs the same fixture-audio neutralization `player.spec.ts` uses — see
  // that file's header for the full reasoning (the fixture audio can't decode; unneutralized,
  // `play()` rejecting and a native `error` event both revert `playerStore`'s "playing" state
  // out from under an assertion). Applied to every test in this file, not just the playback
  // ones at the end, since it's inert for tests that never touch playback.
  await page.addInitScript(() => {
    const proto = HTMLMediaElement.prototype;
    proto.play = () => Promise.resolve();
    proto.pause = function () {};
    Object.defineProperty(proto, 'src', {
      configurable: true,
      get(this: HTMLMediaElement & { _auralisSrc?: string }) {
        return this._auralisSrc ?? '';
      },
      set(this: HTMLMediaElement & { _auralisSrc?: string }, value: string) {
        this._auralisSrc = value;
      },
    });
  });
});

const FAKE_JELLYFIN_BASE_URL = 'http://fake.jellyfin.local';
const FAKE_JELLYFIN_USERNAME = 'nova';
const FAKE_JELLYFIN_PASSWORD = 'stardust1';

test('an unconfigured Jellyfin sends /music to the connect prompt, not an empty library', async ({
  page,
}) => {
  // Signed in already, via the `app` project's `storageState`.
  await page.goto('/settings');
  await expect(page.getByTestId('jellyfin-status-disconnected')).toBeVisible();

  await page.goto('/music');
  await expect(page.getByTestId('music-page')).toBeVisible();
  await expect(page.getByTestId('music-unconfigured')).toBeVisible();

  await page.getByTestId('music-connect-cta').click();
  await expect(page.getByTestId('settings-page')).toBeVisible();
});

test('connecting Jellyfin from Settings shows a connected status', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByTestId('jellyfin-connect-section')).toBeVisible();

  await page.getByTestId('jellyfin-base-url-input').fill(FAKE_JELLYFIN_BASE_URL);
  await page.getByTestId('jellyfin-username-input').fill(FAKE_JELLYFIN_USERNAME);
  await page.getByTestId('jellyfin-password-input').fill(FAKE_JELLYFIN_PASSWORD);
  await page.getByTestId('jellyfin-connect-submit').click();

  await expect(page.getByTestId('jellyfin-status-connected')).toBeVisible();
  await expect(page.getByTestId('jellyfin-status-connected')).toContainText(FAKE_JELLYFIN_BASE_URL);
});

test('a wrong password surfaces the server error instead of silently failing', async ({ page }) => {
  await page.goto('/settings');
  await page.getByTestId('jellyfin-username-input').fill(FAKE_JELLYFIN_USERNAME);
  await page.getByTestId('jellyfin-password-input').fill('not-the-real-password');
  await page.getByTestId('jellyfin-connect-submit').click();

  await expect(page.getByTestId('jellyfin-connect-error')).toBeVisible();
  // Still connected from the previous test — a failed reconnect must not drop
  // the existing working connection (routes/jellyfin.ts: "a failed probe is
  // never persisted").
  await expect(page.getByTestId('jellyfin-status-connected')).toBeVisible();
});

test('Music appears in navigation once Jellyfin is configured', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-rail-expanded').getByRole('button', { name: 'Music' }).click();
  await expect(page.getByTestId('music-page')).toBeVisible();
});

test('the artist grid shows both fixture artists with a range label', async ({ page }) => {
  await page.goto('/music');
  await expect(page.getByTestId('music-artist-cards')).toBeVisible();
  await expect(page.getByTestId('music-artist-artist-nebula')).toContainText(
    'The Nebula Collective',
  );
  await expect(page.getByTestId('music-artist-artist-echo')).toContainText('Echo Fields');

  await expect(page.getByTestId('music-artists-pagination')).toContainText('1–2 of 2');
  await expect(page.getByTestId('music-artists-prev')).toBeDisabled();
  await expect(page.getByTestId('music-artists-next')).toBeDisabled();
});

test('opening an artist shows its albums, and opening an album shows its tracks', async ({
  page,
}) => {
  await page.goto('/music');
  await page.getByTestId('music-artist-artist-nebula').click();

  await expect(page.getByTestId('music-artist-page')).toBeVisible();
  await expect(page.getByTestId('music-artist-name')).toHaveText('The Nebula Collective');
  await expect(page.getByTestId('music-album-album-driftwave')).toContainText('Driftwave');
  await expect(page.getByTestId('music-album-album-nightglass')).toContainText('Nightglass');

  await page.getByTestId('music-album-album-driftwave').click();

  await expect(page.getByTestId('music-album-page')).toBeVisible();
  await expect(page.getByTestId('music-album-name')).toHaveText('Driftwave');
  await expect(page.getByTestId('music-track-track-driftwave-1')).toContainText('Tidal Lines');
  await expect(page.getByTestId('music-track-track-driftwave-1')).toContainText('3:34');
  await expect(page.getByTestId('music-track-track-driftwave-2')).toContainText('Static Coast');
  await expect(page.getByTestId('music-track-track-driftwave-2')).toContainText('3:18');
});

test('an album with no tracks shows an empty state rather than an empty-looking list', async ({
  page,
}) => {
  await page.goto('/music/album/album-nightglass');
  await expect(page.getByTestId('music-album-page')).toBeVisible();
  await expect(page.getByText('No tracks found for this album.')).toBeVisible();
});

test('searching finds a matching artist, album and track, each navigable', async ({ page }) => {
  await page.goto('/music');

  await page.getByTestId('music-search-field').getByRole('combobox').fill('nebula');
  await page.getByTestId('music-search-submit').click();
  await expect(page.getByTestId('music-search-artist-artist-nebula')).toContainText(
    'The Nebula Collective',
  );

  await page.getByTestId('music-search-field').getByRole('combobox').fill('driftwave');
  await page.getByTestId('music-search-submit').click();
  await expect(page.getByTestId('music-search-album-album-driftwave')).toContainText('Driftwave');

  await page.getByTestId('music-search-field').getByRole('combobox').fill('tidal');
  await page.getByTestId('music-search-submit').click();
  const trackResult = page.getByTestId('music-search-track-track-driftwave-1');
  await expect(trackResult).toContainText('Tidal Lines');

  await trackResult.click();
  await expect(page.getByTestId('music-album-page')).toBeVisible();
  await expect(page.getByTestId('music-album-name')).toHaveText('Driftwave');
});

test('a search with no matches says so rather than looking broken', async ({ page }) => {
  await page.goto('/music');
  await page.getByTestId('music-search-field').getByRole('combobox').fill('zzz-no-such-artist');
  await page.getByTestId('music-search-submit').click();

  await expect(page.getByText('No matches for "zzz-no-such-artist".')).toBeVisible();
});

test('clicking a track plays it — the mini player bills the track over the artist', async ({
  page,
}) => {
  await page.goto('/music/album/album-driftwave');
  await expect(page.getByTestId('music-album-page')).toBeVisible();

  await page.getByTestId('music-track-track-driftwave-1').click();

  await expect(page.getByTestId('mini-player')).toBeVisible();
  await expect(page.getByTestId('mini-player-title')).toContainText('Tidal Lines');
  await expect(page.getByTestId('mini-player-author')).toContainText('The Nebula Collective');
});

test('clicking a different row switches the mini player to that track', async ({ page }) => {
  await page.goto('/music/album/album-driftwave');

  await page.getByTestId('music-track-track-driftwave-2').click();
  await expect(page.getByTestId('mini-player-title')).toContainText('Static Coast');
});

test('the full Now Playing surface shows the same track-over-artist billing', async ({ page }) => {
  await page.goto('/music/album/album-driftwave');
  await page.getByTestId('music-track-track-driftwave-1').click();

  await page.getByTestId('mini-player-expand').click();
  await expect(page.getByTestId('now-playing')).toBeVisible();
  await expect(page.getByTestId('now-playing').getByRole('heading', { level: 1 })).toHaveText(
    'Tidal Lines',
  );
  await expect(page.getByTestId('now-playing-author')).toContainText('The Nebula Collective');
});
