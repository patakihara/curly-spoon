/**
 * `LyricsView.tsx`'s render branches, its active-line tracking and its scroll-into-view
 * effect — the component-test gap recorded in `docs/HANDOVER.md` (this repo has no jsdom/
 * `@testing-library/react`, so a `.tsx` render test can't run; see that component's own
 * header comment). Playwright fills the gap instead: a real browser, real DOM, real
 * `scrollIntoView`.
 *
 * `lyrics.ts`'s pure `activeLineIndex`/`activeLyric` logic is already unit-tested
 * (`apps/web/src/features/music/lyrics.test.ts`) — nothing here duplicates those cases.
 * This file only covers what a unit test of the pure logic cannot: that the component
 * actually wires that logic to the DOM correctly.
 *
 * Fixture data (`apps/server/src/testSupport/fakes/fakeJellyfin.ts`):
 * - `track-driftwave-1` ("Tidal Lines", on `album-driftwave`) — synced, two lines, at 0s
 *   and 3.25s. Used for the active-line-crossing test below.
 * - `track-driftwave-2` ("Static Coast", same album) — unsynced, one line, no timestamp.
 * - `track-hollow-1` ("Empty Rooms", `album-hollow`) — no lyrics entry at all.
 * - `track-wavelengths-1` ("Horizon Radio", `album-wavelengths`, added alongside this spec)
 *   — 15 synced lines, 5s apart, 0s-70s. The only fixture track with enough lines to
 *   overflow `.auralis-lyrics`'s `max-height: 320px` (`apps/web/src/styles/app.css`), so the
 *   scroll-into-view tests below have a line that starts genuinely off-screen to scroll to.
 *   Added under `artist-echo` as a new album rather than extending `album-driftwave` or
 *   `album-hollow`, because both those albums' track counts are asserted exactly elsewhere
 *   (`jellyfin.test.ts`'s "returns tracks scoped to one album via albumId" expects 2 for
 *   Driftwave; nothing hardcodes Hollow's count, but its 1-track fixture is the one
 *   `music.spec.ts`'s no-lyrics test also depends on staying put).
 *
 * Jellyfin's connect state is process-global, not scoped to the signed-in session — the
 * same reason `music.spec.ts`/`search-music.spec.ts` run `serial` and connect as their own
 * first test, idempotently, rather than assuming another file already has. Copied here for
 * the same reason: `serial` orders tests within *this* file, not across files, and
 * `fullyParallel` (`playwright.config.ts`) means nothing else guarantees ordering otherwise.
 */
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const FAKE_JELLYFIN_BASE_URL = 'http://fake.jellyfin.local';
const FAKE_JELLYFIN_USERNAME = 'nova';
const FAKE_JELLYFIN_PASSWORD = 'stardust1';

interface ScrollCall {
  testid: string | undefined;
  behavior: string | undefined;
  block: string | undefined;
}

declare global {
  interface Window {
    __scrollCalls?: ScrollCall[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Neutralises the fixture <audio> element — see `player.spec.ts`'s header for the full
    // reasoning (the fixture audio can't decode; unneutralized, `play()` rejecting and a
    // native `error` event both independently revert `playerStore`'s "playing" state out
    // from under an assertion). Copied verbatim from that file/`music.spec.ts`, not
    // refactored into a shared helper — this project has no `e2e/app/helpers` entry for it
    // yet and neither of those files reaches for one either.
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

    // Records every `Element.scrollIntoView` call this page makes, then calls through to
    // the real implementation — `LyricsView.tsx` is the only caller anywhere in this
    // codebase (confirmed by grep before writing this), so every recorded call belongs to
    // it. Calling through (rather than stubbing the effect out entirely) keeps the real
    // browser scroll happening too, which the off-screen-line test below checks directly
    // via the container's own `scrollTop` — this spy adds an observation, it doesn't fake
    // one out.
    const calls: ScrollCall[] = [];
    window.__scrollCalls = calls;
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (
      this: Element,
      arg?: boolean | ScrollIntoViewOptions,
    ) {
      const opts = typeof arg === 'object' ? arg : undefined;
      calls.push({
        testid: (this as HTMLElement).dataset.testid,
        behavior: opts?.behavior,
        block: opts?.block,
      });
      return original.call(this, arg as ScrollIntoViewOptions);
    };
  });
});

/**
 * Moves the "Seek" slider to an exact integer second via its own keyboard handling
 * (`packages/ui/src/components/Slider.tsx`: `Home` jumps to `min`, `PageUp` steps by
 * `step * 10`, `ArrowRight` by `step` — both 1 here, since `NowPlaying.tsx` passes no
 * `step` prop) rather than clicking a computed pixel position. Deterministic regardless of
 * the slider's rendered width, and exact where a pixel click would only be approximately
 * right — the driftwave crossing test below distinguishes 3s from 4s, well under one
 * rendered pixel's worth of a multi-hundred-second track.
 *
 * Located by ARIA role/name rather than by `data-testid="player-scrubber"`. That test id was
 * genuinely missing from the DOM when this spec was written — `Slider` dropped every
 * pass-through prop — and it renders correctly now that `a6c61d4` fixed that. The role-based
 * locator is kept anyway: it asserts the scrubber is reachable the way a screen reader
 * reaches it, which is the stronger claim.
 */
async function seekToSeconds(page: Page, seconds: number) {
  const slider = page.getByRole('slider', { name: 'Seek' });
  await slider.press('Home');
  const bigSteps = Math.floor(seconds / 10);
  for (let i = 0; i < bigSteps; i += 1) {
    await slider.press('PageUp');
  }
  const remainder = seconds - bigSteps * 10;
  for (let i = 0; i < remainder; i += 1) {
    await slider.press('ArrowRight');
  }
}

async function readScrollCalls(page: Page): Promise<ScrollCall[]> {
  return page.evaluate(() => window.__scrollCalls ?? []);
}

test('connecting Jellyfin from Settings', async ({ page }) => {
  await page.goto('/settings');
  await page.getByTestId('jellyfin-base-url-input').fill(FAKE_JELLYFIN_BASE_URL);
  await page.getByTestId('jellyfin-username-input').fill(FAKE_JELLYFIN_USERNAME);
  await page.getByTestId('jellyfin-password-input').fill(FAKE_JELLYFIN_PASSWORD);
  await page.getByTestId('jellyfin-connect-submit').click();

  await expect(page.getByTestId('jellyfin-status-connected')).toBeVisible();
});

test('synced lyrics highlight the current line, not the next one, as playback crosses a line boundary', async ({
  page,
}) => {
  await page.goto('/music/album/album-driftwave');
  await expect(page.getByTestId('music-album-page')).toBeVisible();
  await page.getByTestId('music-track-track-driftwave-1').click();
  await expect(page.getByTestId('mini-player')).toBeVisible();

  // `now-playing` is always present at this suite's 1280x900 default viewport (the
  // `expanded` breakpoint's persistent side panel, `NowPlayingPanel.tsx`) — this click
  // matches `music.spec.ts`'s own convention and is inert here, not load-bearing.
  await page.getByTestId('mini-player-expand').click();
  await expect(page.getByTestId('now-playing')).toBeVisible();

  const line0 = page.getByTestId('lyrics-line-0');
  const line1 = page.getByTestId('lyrics-line-1');
  await expect(line0).toHaveText('Tidal lines on the shore');
  await expect(line1).toHaveText('Static coast forevermore');

  // Playback starts at currentTime 0 — line 0 is active immediately: `activeLineIndex`
  // treats a line's own start second as already active (`lyrics.ts`'s own doc comment).
  await expect(line0).toHaveClass(/auralis-lyrics__line--active/);
  await expect(line1).not.toHaveClass(/auralis-lyrics__line--active/);

  // Line 1 starts at 3.25s. At 3s — still before it — line 0 must still be the active one.
  // This is the actual regression `lyrics.ts` guards against: highlighting the *next* line
  // early rather than the current one.
  await seekToSeconds(page, 3);
  await expect(line0).toHaveClass(/auralis-lyrics__line--active/);
  await expect(line1).not.toHaveClass(/auralis-lyrics__line--active/);

  // Crossing to 4s — past 3.25s — flips the highlight to line 1, and only line 1.
  await seekToSeconds(page, 4);
  await expect(line1).toHaveClass(/auralis-lyrics__line--active/);
  await expect(line0).not.toHaveClass(/auralis-lyrics__line--active/);
});

test('unsynced lyrics render as plain text and never highlight, even as playback advances', async ({
  page,
}) => {
  await page.goto('/music/album/album-driftwave');
  await page.getByTestId('music-track-track-driftwave-2').click();
  await expect(page.getByTestId('mini-player-title')).toContainText('Static Coast');
  await page.getByTestId('mini-player-expand').click();

  const line0 = page.getByTestId('lyrics-line-0');
  await expect(line0).toHaveText('plain text, no timing at all');
  await expect(line0).not.toHaveClass(/auralis-lyrics__line--active/);
  // Confirms this is genuinely the one-line unsynced fixture, not driftwave-1's two lines
  // left over from a previous test.
  await expect(page.getByTestId('lyrics-line-1')).toHaveCount(0);

  // Advancing playback (the queue's cumulative currentTime, via the same skip control
  // `player.spec.ts` uses) must not retroactively highlight the only line — `lyrics.synced`
  // being false short-circuits `isActive` in `LyricsView.tsx` regardless of index.
  await page.getByTestId('player-skip-forward').click();
  await expect(line0).not.toHaveClass(/auralis-lyrics__line--active/);
});

test('a track with no lyrics shows the no-lyrics message, not an error', async ({ page }) => {
  await page.goto('/music/album/album-hollow');
  await expect(page.getByTestId('music-album-page')).toBeVisible();
  await page.getByTestId('music-track-track-hollow-1').click();
  await expect(page.getByTestId('mini-player-title')).toContainText('Empty Rooms');
  await page.getByTestId('mini-player-expand').click();

  const lyricsView = page.getByTestId('lyrics-view');
  // Waits out the loading skeleton (same `data-testid`, different content) implicitly —
  // `toHaveText` retries until the query settles.
  await expect(lyricsView).toHaveText('No lyrics for this track.');
  // The real assertion: a track having no lyrics is Jellyfin's normal case for most of a
  // library, not a failure — `role="alert"` is reserved for the genuine fetch-error branch.
  await expect(lyricsView).not.toHaveAttribute('role', 'alert');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('playing a book fires no lyrics request and shows no lyrics affordance', async ({ page }) => {
  const lyricsRequests: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/jellyfin/tracks/') && req.url().includes('/lyrics')) {
      lyricsRequests.push(req.url());
    }
  });

  await page.goto('/');
  await expect(page.getByTestId('home-page')).toBeVisible();
  await page.getByTestId('shelf-item-item-dune').click();
  await expect(page).toHaveURL(/\/item\/item-dune$/);
  await expect(page.getByTestId('item-page')).toBeVisible();
  await page.getByTestId('item-play').click();
  await expect(page.getByTestId('mini-player')).toBeVisible();

  await page.getByTestId('mini-player-expand').click();
  await expect(page.getByTestId('now-playing')).toBeVisible();

  // `LyricsView.tsx` returns `null` outright for a non-Jellyfin item — no lyrics affordance
  // of any kind, not even a hidden one.
  await expect(page.getByTestId('lyrics-view')).toHaveCount(0);

  // The network side: a request that fired and was silently discarded would still pass the
  // UI-only check above. `useJellyfinLyricsQuery`'s `enabled` only ever depends on synchronous
  // render state (no async gate to race), so a short settle window is enough to prove none
  // fired — matches this suite's own precedent for a fixed wait (`e2e/ui/*.spec.ts`).
  await page.waitForTimeout(500);
  expect(lyricsRequests).toEqual([]);
});

test('without a reduced-motion preference, the active line scrolls smoothly into view', async ({
  page,
}) => {
  await page.goto('/music/album/album-wavelengths');
  await page.getByTestId('music-track-track-wavelengths-1').click();
  await expect(page.getByTestId('mini-player-title')).toContainText('Horizon Radio');
  await page.getByTestId('mini-player-expand').click();
  await expect(page.getByTestId('lyrics-line-0')).toBeVisible();

  // The mount-time effect fires once for line 0, the instant lyrics load — no seeking
  // needed to observe a first call.
  const calls = await readScrollCalls(page);
  expect(calls.some((c) => c.testid === 'lyrics-line-0' && c.behavior === 'smooth')).toBe(true);
});

test('with prefers-reduced-motion, the active line scroll is instant rather than smooth', async ({
  page,
}) => {
  await page.goto('/music/album/album-wavelengths');
  // Set before the track is clicked (and so before `LyricsView` mounts): its `reducedMotion`
  // state is `useState(prefersReducedMotion)`, read once at mount — a preference set after
  // mount would only reach it via `watchReducedMotion`'s 'change' listener, which the OS
  // media-query API doesn't fire just because `emulateMedia` changed the query's answer
  // between renders in a way this test needs to depend on.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByTestId('music-track-track-wavelengths-1').click();
  await expect(page.getByTestId('mini-player-title')).toContainText('Horizon Radio');
  await page.getByTestId('mini-player-expand').click();
  await expect(page.getByTestId('lyrics-line-0')).toBeVisible();

  const calls = await readScrollCalls(page);
  expect(calls.some((c) => c.testid === 'lyrics-line-0' && c.behavior === 'auto')).toBe(true);
  expect(calls.every((c) => c.behavior !== 'smooth')).toBe(true);
});

test('the active line scrolls into view as playback advances past lines that start off-screen', async ({
  page,
}) => {
  // Reduced motion here too — not testing the preference itself (the test above does), but
  // avoiding a race against a real CSS smooth-scroll animation's own duration when reading
  // `scrollTop` below. Instant ('auto') scrolling lands synchronously with the call.
  await page.goto('/music/album/album-wavelengths');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByTestId('music-track-track-wavelengths-1').click();
  await page.getByTestId('mini-player-expand').click();
  await expect(page.getByTestId('lyrics-line-0')).toBeVisible();

  const container = page.getByTestId('lyrics-view');
  const initialScrollTop = await container.evaluate((el) => el.scrollTop);

  // Line 14 ("Horizon fades to gentle grey") starts at 70s. 15 lines at the panel's
  // body-large type size overflow `.auralis-lyrics`'s 320px `max-height`
  // (`apps/web/src/styles/app.css`), so this line starts genuinely off-screen at mount —
  // the exact scenario this test exists to cover, not just "any two lines close together".
  await seekToSeconds(page, 70);
  await expect(page.getByTestId('lyrics-line-14')).toHaveClass(/auralis-lyrics__line--active/);

  const finalScrollTop = await container.evaluate((el) => el.scrollTop);
  expect(finalScrollTop).toBeGreaterThan(initialScrollTop);

  const calls = await readScrollCalls(page);
  expect(calls.some((c) => c.testid === 'lyrics-line-14')).toBe(true);
});
