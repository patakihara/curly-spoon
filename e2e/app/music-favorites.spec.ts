/**
 * `/music/favorites` (a11y audit, 2026-08-05): unfavouriting a track used to remove its row
 * with no live-region announcement at all (verified with a `MutationObserver` over every
 * `[aria-live]`/`[role=status]`/`[role=alert]` in the real app), and drop focus to `<body>`
 * because the focused toggle's own row disappeared out from under it. Fixed in
 * `MusicFavoritesPage.tsx`:
 *
 * - Each section's list is filtered to `favorite === true` so a row disappears synchronously
 *   with the optimistic cache write (`useToggleJellyfinFavoriteMutation`'s `onMutate`)
 *   instead of waiting on the later `invalidateQueries` refetch — the row would otherwise
 *   still be present (with the icon merely flipped) when any mutation-resolution callback
 *   fired, which is too late to redirect focus before the browser drops it to `<body>`.
 * - `FavoriteToggle`'s new `onToggle` fires synchronously, before the mutation starts, which
 *   is what lets this page move focus *before* its own row vanishes: to the section's own
 *   `<h2>` if that section still has other favourites left, or the page's own `<h1>` if this
 *   was the last one in it (both `tabIndex={-1}`, focusable but not tab-stops).
 * - The removal itself is announced via the same `Snackbar` (`role="status"`,
 *   `aria-live="polite"`) `AddToPlaylistButton`'s "Added to playlist." success path already
 *   uses — one discrete announcement per user-triggered removal, not a per-render live
 *   region (see that component's own header for why lyrics deliberately has none at all).
 *
 * Reuses "Driftwave" (`album-driftwave`, 2 tracks: "Tidal Lines" / `track-driftwave-1`,
 * "Static Coast" / `track-driftwave-2`) from `apps/server/src/testSupport/fakes/
 * fakeJellyfin.ts` — same fixture `music.spec.ts`/`music-queue.spec.ts` already exercise.
 */
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

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

test('unfavouriting a track announces the removal and moves focus to a sensible place, never to <body>', async ({
  page,
}) => {
  // Favourite both of Driftwave's tracks first, so the favourites page has something to
  // remove from. Forced to `true` rather than blindly clicked: the fake Jellyfin's favourite
  // state is process-global and shared with every other spec file in this project (see
  // `playwright.config.ts`'s "order-independent, not concurrency-safe" note), and
  // `context-menu.spec.ts` favourites these same two tracks for its own later tests without
  // un-favouriting them again. A blind `.click()` here would toggle an already-favourited
  // track *off* when this file runs after that one, silently establishing the wrong
  // precondition. Checking `aria-pressed` first makes this test's own precondition true
  // regardless of what any other file left behind.
  await page.goto('/music/album/album-driftwave');
  for (const trackId of ['track-driftwave-1', 'track-driftwave-2']) {
    const toggle = page.getByTestId(`music-track-favorite-${trackId}`);
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    }
  }

  await page.goto('/music/favorites');
  await expect(page.getByTestId('music-favorites-track-toggle-track-driftwave-1')).toBeVisible();
  await expect(page.getByTestId('music-favorites-track-toggle-track-driftwave-2')).toBeVisible();

  // Remove the first of two — the "Tracks" section survives with one favourite left, so
  // focus should land on its own <h2>, not be lost to <body>.
  await page.getByTestId('music-favorites-track-toggle-track-driftwave-1').click();
  await expect(page.getByTestId('music-favorites-track-toggle-track-driftwave-1')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('Tidal Lines removed from favourites.');
  await expect(page.getByRole('heading', { name: 'Tracks', level: 2 })).toBeFocused();

  // Remove the last one — the "Tracks" section itself disappears, so focus falls back to
  // the page's own <h1>.
  await page.getByTestId('music-favorites-track-toggle-track-driftwave-2').click();
  await expect(page.getByTestId('music-favorites-track-toggle-track-driftwave-2')).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('Static Coast removed from favourites.');
  await expect(page.getByRole('heading', { name: 'Favourites', level: 1 })).toBeFocused();
});
