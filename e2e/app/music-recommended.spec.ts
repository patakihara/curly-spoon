/**
 * `GET /music/recommended`'s web consumer (docs/ROADMAP.md §13, wave 13f-1). The route
 * shipped in 13e-2 with no reader anywhere in the tree — `docs/HANDOVER.md`'s
 * most-repeated failure class, "a wave that adds a writer must name its reader" — so this
 * file exists to prove the shelves are actually reachable from the running app, not just
 * fetchable.
 *
 * Its own file, not appended to `music.spec.ts`: that file is `serial` and already large,
 * and per that file's own header, connecting Jellyfin is idempotent (`POST /jellyfin/config`
 * overwrites), so this file makes its own precondition true in each test's `beforeEach`
 * rather than depending on `music.spec.ts` having run first or in a particular order — the
 * exact trap `docs/HANDOVER.md` names for this shared, single-tenant, stateful BFF.
 *
 * Fixture data (`apps/server/src/testSupport/fakes/fakeJellyfin.ts`), mirroring the server's
 * own `GET /api/v1/music/recommended` route test (`jellyfin.test.ts`): "Driftwave"
 * (`album-driftwave`, genre Synthwave) and "Nightglass" (`album-nightglass`, genre
 * Synthwave) both belong to The Nebula Collective; "Lumenfall" (`album-lumenfall`, genre
 * Synthwave) belongs to Lumen Cascade. Reporting heavy play on Driftwave's own track
 * produces a Synthwave-genre shelf recommending the other two Synthwave albums, excluding
 * Driftwave itself — the same signal the server-side test seeds.
 */
import { expect, test } from '@playwright/test';

const FAKE_JELLYFIN_BASE_URL = 'http://fake.jellyfin.local';
const FAKE_JELLYFIN_USERNAME = 'nova';
const FAKE_JELLYFIN_PASSWORD = 'stardust1';

test.beforeEach(async ({ page }) => {
  // Connects (or reconnects — idempotent) Jellyfin for this session, exactly as
  // `music.spec.ts`'s first test does. Every test below needs both a configured
  // Jellyfin *and* this user's own stored Jellyfin credentials — `POST
  // /jellyfin/playback/stopped` and `GET /music/recommended` both call
  // `app.jellyfin.forUser(userId)`, which throws `JellyfinNoCredentialsError` (401)
  // without a prior per-user login, config alone isn't enough.
  await page.goto('/settings');
  await page.getByTestId('jellyfin-base-url-input').fill(FAKE_JELLYFIN_BASE_URL);
  await page.getByTestId('jellyfin-username-input').fill(FAKE_JELLYFIN_USERNAME);
  await page.getByTestId('jellyfin-password-input').fill(FAKE_JELLYFIN_PASSWORD);
  await page.getByTestId('jellyfin-connect-submit').click();
  await expect(page.getByTestId('jellyfin-status-connected')).toBeVisible();
});

test('a signal-less user sees no recommended shelves on /music (cold start is a no-op)', async ({
  page,
}) => {
  await page.goto('/music');
  await expect(page.getByTestId('music-artist-cards')).toBeVisible();
  await expect(page.getByTestId('music-recommended-shelves')).toHaveCount(0);
});

test('recommended album shelves render on /music once there is listening signal, with a reason line whose paragraph is the card list’s aria-describedby target', async ({
  page,
}) => {
  // Seed listening history through the real playback-report path, same as
  // `jellyfin.test.ts`'s server-side route test for this exact endpoint: five stop
  // reports against one of Driftwave's tracks.
  for (let i = 0; i < 5; i += 1) {
    const response = await page.request.post('/api/v1/jellyfin/playback/stopped', {
      data: { itemId: 'track-driftwave-1', positionSeconds: 200 },
    });
    expect(response.ok()).toBe(true);
  }

  await page.goto('/music');
  await expect(page.getByTestId('music-artist-cards')).toBeVisible();

  const shelvesContainer = page.getByTestId('music-recommended-shelves');
  await expect(shelvesContainer).toBeVisible({ timeout: 10_000 });

  const shelf = shelvesContainer.locator('section[data-testid^="shelf-music-recommended-"]').first();
  await expect(shelf).toBeVisible();
  const shelfTestId = await shelf.getAttribute('data-testid');
  const shelfId = shelfTestId!.replace('shelf-', '');

  // The reason line is present and non-empty — never asserting its exact copy, which
  // `docs/HANDOVER.md` names as the server's first draft and free to change.
  const reason = page.getByTestId(`shelf-reason-${shelfId}`);
  await expect(reason).toBeVisible();
  const reasonText = await reason.textContent();
  expect(reasonText).not.toBeNull();
  expect(reasonText!.trim().length).toBeGreaterThan(0);
  const reasonId = await reason.getAttribute('id');

  // Accessibility contract set by 13c and non-negotiable (docs/HANDOVER.md): the reason
  // is not tied to the <h2> — the card list (role="list") carries aria-describedby
  // pointing at the reason paragraph, so a screen reader announces title then reason as
  // name plus description.
  const cardList = page.getByTestId(`shelf-track-${shelfId}`);
  await expect(cardList).toHaveAttribute('role', 'list');
  await expect(cardList).toHaveAttribute('aria-describedby', reasonId!);

  const heading = shelf.locator('h2');
  await expect(heading).not.toHaveAttribute('aria-describedby', reasonId!);

  // Driftwave itself — the album whose track was just played heavily — must not be
  // among the recommended cards; the scorer excludes already-well-known items.
  await expect(shelf.getByTestId('shelf-item-album-driftwave')).toHaveCount(0);
});

// The true never-configured-Jellyfin case (`music-unconfigured` connect prompt, never an
// error state) lives in `jellyfin-unconfigured.spec.ts`, in its own dependency-ordered
// project — deliberately not duplicated or re-asserted here. That file's own precondition
// (a Jellyfin that has *never* been configured in this process) would be destroyed by
// disconnecting it from inside this file: `POST /jellyfin/config` is process-global and
// `fullyParallel` runs every file in this project concurrently, so flipping it off here
// would race whichever other file currently assumes Jellyfin stays connected. This file's
// own `beforeEach` only ever connects, never disconnects, for exactly that reason.
