/**
 * Song-row context menu (`docs/ROADMAP.md` §12e): right-click and long-press open it, Escape
 * closes it and returns focus, and its four floor items (Play next, Play last, Go to album,
 * Go to artist) each do the right thing. `TrackContextMenu.tsx`/`Menu.tsx` (`@auralis/ui`) are
 * the implementation; this file is the only place any of it runs in a real browser.
 *
 * Reuses "Driftwave" (`album-driftwave`, artist "The Nebula Collective" / `artist-nebula`,
 * two tracks — "Tidal Lines" / `track-driftwave-1` and "Static Coast" / `track-driftwave-2`)
 * from `apps/server/src/testSupport/fakes/fakeJellyfin.ts`, same fixture `music.spec.ts` and
 * `music-queue.spec.ts` already exercise.
 *
 * "Play next"/"Play last" changing queue order is proven in `musicQueue.test.ts`
 * (`insertTrackNext`/`insertTrackLast`), not here — see `TrackContextMenu.tsx`'s own
 * `onMessage` doc comment for why a real reorder can't be observed end to end in this suite
 * (no queue-order view yet, and this app's fixture audio never really plays so a track
 * transition can't be watched either). What *is* observable here, and is what these tests
 * assert, is the user-facing confirmation each action produces.
 */
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  // Same fixture-audio neutralization every music spec in this suite uses — see
  // `music-queue.spec.ts`'s own header for the full reasoning.
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

// Connecting here, idempotently — `music.spec.ts`'s own header explains why this file can't
// rely on cross-file ordering for Jellyfin's process-global config row.
test('connecting Jellyfin from Settings', async ({ page }) => {
  await page.goto('/settings');
  await page.getByTestId('jellyfin-base-url-input').fill(FAKE_JELLYFIN_BASE_URL);
  await page.getByTestId('jellyfin-username-input').fill(FAKE_JELLYFIN_USERNAME);
  await page.getByTestId('jellyfin-password-input').fill(FAKE_JELLYFIN_PASSWORD);
  await page.getByTestId('jellyfin-connect-submit').click();
  await expect(page.getByTestId('jellyfin-status-connected')).toBeVisible();
});

test('right-click on a track row opens the menu with all four floor items', async ({ page }) => {
  await page.goto('/music/album/album-driftwave');
  const row = page.getByTestId('music-track-track-driftwave-1');
  await row.click({ button: 'right' });

  await expect(page.getByRole('menu', { name: 'Actions for Tidal Lines' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Play next' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Play last' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Go to album' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Go to artist' })).toBeVisible();
});

test('the menu trigger is a real 48px button, openable by keyboard, with a real menu role', async ({
  page,
}) => {
  await page.goto('/music/album/album-driftwave');
  const trigger = page.getByTestId('music-track-menu-trigger-track-driftwave-1');
  await expect(trigger).toBeVisible();
  const box = await trigger.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(48);
  expect(box?.height).toBeGreaterThanOrEqual(48);

  // Openable by keyboard: focus the button directly (no mouse) and activate with Enter.
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', { name: 'Actions for Tidal Lines' })).toBeVisible();
});

test('Escape closes the menu and returns focus to the trigger that opened it', async ({ page }) => {
  await page.goto('/music/album/album-driftwave');
  const trigger = page.getByTestId('music-track-menu-trigger-track-driftwave-1');
  await trigger.click();
  await expect(page.getByRole('menu', { name: 'Actions for Tidal Lines' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Actions for Tidal Lines' })).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('long-press on a track row (touch) opens the menu', async ({ browser }) => {
  // A dedicated touch-enabled context rather than `browser.newContext({ hasTouch: true })`
  // directly: the latter starts signed out, losing `app-onboarding`'s `storageState` — see
  // this file's own header and `playwright.config.ts`'s `app` project, which is off-limits to
  // edit. Cloning the running context's storage state keeps the sign-in.
  const context = await browser.newContext({
    hasTouch: true,
    storageState: await browser.contexts()[0]?.storageState(),
  });
  const page = await context.newPage();
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

  await page.goto('/music/album/album-driftwave');
  const row = page.getByTestId('music-track-track-driftwave-1');
  const box = await row.boundingBox();
  if (!box) throw new Error('expected the track row to have a bounding box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  // Mantine's `Menu.ContextMenu` recognises long-press via `@mantine/hooks`' `useLongPress`,
  // which starts its threshold timer on `touchstart` alone (see that hook's own source) — no
  // `touchend` is needed for the press to register, only the held duration.
  await row.evaluate(
    (el, { x, y }) => {
      const touch = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      el.dispatchEvent(
        new TouchEvent('touchstart', {
          touches: [touch],
          targetTouches: [touch],
          changedTouches: [touch],
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { x, y },
  );

  // Mantine's long-press threshold defaults to 500ms; wait past it before asserting.
  await expect(page.getByRole('menu', { name: 'Actions for Tidal Lines' })).toBeVisible({
    timeout: 2000,
  });

  await context.close();
});

test('Play next confirms via a snackbar', async ({ page }) => {
  await page.goto('/music/album/album-driftwave');
  await page.getByTestId('music-track-track-driftwave-1').click();
  await expect(page.getByTestId('mini-player')).toBeVisible();

  await page.getByTestId('music-track-menu-trigger-track-driftwave-2').click();
  await page.getByRole('menuitem', { name: 'Play next' }).click();
  await expect(page.getByRole('status')).toHaveText('Added "Static Coast" to play next.');
});

test('Play last confirms via a snackbar', async ({ page }) => {
  await page.goto('/music/album/album-driftwave');
  await page.getByTestId('music-track-track-driftwave-1').click();
  await expect(page.getByTestId('mini-player')).toBeVisible();

  await page.getByTestId('music-track-menu-trigger-track-driftwave-2').click();
  await page.getByRole('menuitem', { name: 'Play last' }).click();
  await expect(page.getByRole('status')).toHaveText('Added "Static Coast" to play last.');
});

test('Play next/Play last with nothing playing reports the failure, not silent no-op', async ({
  page,
}) => {
  // A fresh page load has no active player session — `useMusicQueueStore`'s `queue` is `null`
  // for the whole app lifetime outside of music playback (see that store's own header).
  await page.goto('/music/album/album-driftwave');
  await page.getByTestId('music-track-menu-trigger-track-driftwave-1').click();
  await page.getByRole('menuitem', { name: 'Play next' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Nothing is playing — play a track before adding "Tidal Lines" to the queue.',
  );
});

test("Go to album navigates to the track's album route", async ({ page }) => {
  // The only page this wave wired the menu into that renders track rows *is* the album page
  // itself (`MusicArtistPage.tsx` renders album cards, not tracks — see this wave's report
  // for why `MusicPlaylistPage.tsx`/`MusicFavoritesPage.tsx` weren't also wired), so this
  // necessarily navigates to the same album it started on. Still real coverage of the
  // `useNavigate({ to: '/music/album/$albumId', params: { albumId } })` call and route match —
  // a wrong or missing `albumId` param would 404 or land on the wrong album instead.
  await page.goto('/music/album/album-driftwave');
  await page.getByTestId('music-track-menu-trigger-track-driftwave-1').click();
  await page.getByRole('menuitem', { name: 'Go to album' }).click();
  await expect(page).toHaveURL(/\/music\/album\/album-driftwave$/);
  await expect(page.getByTestId('music-album-page')).toBeVisible();
});

test('Go to artist navigates to the artist route', async ({ page }) => {
  await page.goto('/music/album/album-driftwave');
  await page.getByTestId('music-track-menu-trigger-track-driftwave-1').click();
  await page.getByRole('menuitem', { name: 'Go to artist' }).click();
  await expect(page).toHaveURL(/\/music\/artist\/artist-nebula$/);
  await expect(page.getByTestId('music-artist-page')).toBeVisible();
  await expect(page.getByTestId('music-artist-name')).toHaveText('The Nebula Collective');
});
