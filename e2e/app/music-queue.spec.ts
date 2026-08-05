/**
 * Shuffle/repeat controls (Phase 9 web wave: explicit ordered queue, `features/music/
 * musicQueue.ts`). What this file proves is the *controls themselves* — toggling shuffle/
 * repeat updates their own accessible state in a real browser and never disturbs the
 * currently playing track — and that they're absent entirely for a book, since they're a
 * music-only affordance (`NowPlaying.tsx`'s `showQueueControls`).
 *
 * The queue's actual shuffle/repeat/cross-page *advance* logic (what happens when a track's
 * native `ended` event fires) can't be exercised here at all: same fixture-audio limitation
 * `player.spec.ts`'s own header documents — this app's e2e fixture audio is synthetic byte
 * noise real browsers refuse to decode, so `ended` never fires for real, and this file's
 * `beforeEach` neutralizes `play()`/`pause()`/`src` for the same reason `music.spec.ts` does.
 * That logic is unit-tested instead, in `musicQueue.test.ts` (the pure `advance`/`setShuffled`
 * /`setRepeatMode` functions) and `musicQueueController.test.ts` (the `playerStore.
 * onTrackEnded` wiring, including the cross-page fetch and repeat-one/repeat-all behaviour).
 *
 * Reuses "Driftwave" (`album-driftwave`, 2 tracks, `total: 2`) from `apps/server/src/
 * testSupport/fakes/fakeJellyfin.ts` — same fixture `music.spec.ts` already exercises.
 */
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  // Same neutralization `music.spec.ts`/`player.spec.ts` use — see either file's header.
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

// Connecting here, idempotently, rather than assuming another file already has —
// `music.spec.ts`'s own header explains why this file can't rely on cross-file ordering.
test('connecting Jellyfin from Settings', async ({ page }) => {
  await page.goto('/settings');
  await page.getByTestId('jellyfin-base-url-input').fill(FAKE_JELLYFIN_BASE_URL);
  await page.getByTestId('jellyfin-username-input').fill(FAKE_JELLYFIN_USERNAME);
  await page.getByTestId('jellyfin-password-input').fill(FAKE_JELLYFIN_PASSWORD);
  await page.getByTestId('jellyfin-connect-submit').click();
  await expect(page.getByTestId('jellyfin-status-connected')).toBeVisible();
});

test('shuffle toggles its pressed state without changing the current track', async ({ page }) => {
  await page.goto('/music/album/album-driftwave');
  await page.getByTestId('music-track-track-driftwave-1').click();
  await page.getByTestId('mini-player-expand').click();
  await expect(page.getByTestId('now-playing').getByRole('heading', { level: 1 })).toHaveText(
    'Tidal Lines',
  );

  const shuffle = page.getByTestId('player-shuffle-toggle');
  await expect(shuffle).toHaveAttribute('aria-pressed', 'false');

  await shuffle.click();
  await expect(shuffle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('now-playing').getByRole('heading', { level: 1 })).toHaveText(
    'Tidal Lines',
  );

  await shuffle.click();
  await expect(shuffle).toHaveAttribute('aria-pressed', 'false');
});

test('repeat cycles off -> all -> one -> off with a distinct accessible name at each step', async ({
  page,
}) => {
  await page.goto('/music/album/album-driftwave');
  await page.getByTestId('music-track-track-driftwave-1').click();
  await page.getByTestId('mini-player-expand').click();

  const repeat = page.getByTestId('player-repeat-toggle');
  await expect(repeat).toHaveAttribute('aria-pressed', 'false');
  const offLabel = await repeat.getAttribute('aria-label');

  await repeat.click();
  await expect(repeat).toHaveAttribute('aria-pressed', 'true');
  const allLabel = await repeat.getAttribute('aria-label');
  expect(allLabel).not.toBe(offLabel);

  await repeat.click();
  await expect(repeat).toHaveAttribute('aria-pressed', 'true');
  const oneLabel = await repeat.getAttribute('aria-label');
  expect(oneLabel).not.toBe(allLabel);
  expect(oneLabel).not.toBe(offLabel);

  await repeat.click();
  await expect(repeat).toHaveAttribute('aria-pressed', 'false');
  await expect(repeat).toHaveAttribute('aria-label', offLabel ?? '');
});

test('shuffle and repeat controls are absent for a book — they are a music-only affordance', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('home-page')).toBeVisible();
  await page.getByTestId('shelf-item-item-dune').click();
  await expect(page).toHaveURL(/\/item\/item-dune$/);
  await page.getByTestId('item-play').click();
  await expect(page.getByTestId('mini-player')).toBeVisible();

  await page.getByTestId('mini-player-expand').click();
  await expect(page.getByTestId('now-playing')).toBeVisible();
  await expect(page.getByTestId('player-shuffle-toggle')).toHaveCount(0);
  await expect(page.getByTestId('player-repeat-toggle')).toHaveCount(0);
});
