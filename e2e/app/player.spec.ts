/**
 * The player surface: mini player, Now Playing, chapters, skip, speed and
 * bookmarks. Every assertion here is about store-derived UI (a label, an
 * `aria-` attribute) after an explicit user action — never about real playback
 * progressing. `useAudioElement.ts`'s header explains why: this app's e2e
 * fixture audio is synthetic byte noise that real browsers refuse to decode, so
 * `play()` rejects and `timeupdate` never fires. A test that waited for time to
 * advance would hang forever.
 *
 * Fixture data (apps/server/src/testSupport/fakes/fixtures/items-books.json):
 * `item-dune` is 1260s across two chapters — "Part One" (0–630s) and "Part Two"
 * (630–1260s) — which is what makes it useful here: two chapters to click
 * between, and round numbers (630s = 10:30) that are easy to assert on exactly.
 */
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // The fixture audio can't decode (see file header), and that produces *two*
  // independent async reversions of the store's "playing" state, not one:
  // `HTMLMediaElement.play()` rejects (useAudioElement.ts's `.catch()` calls
  // `pause()`), and — separately — assigning `.src` starts the browser's own
  // media-load pipeline, which fires a native `error` event on decode failure
  // (`handleError`, also wired to `pause()`) regardless of whether `play()` was
  // ever called. Either can land at any point, including inside this file's own
  // assertions' polling windows, which is why stubbing only `play()` still left
  // this suite flaky under CI load — sometimes the *first* `toHaveAttribute`
  // check below failed, sometimes the one after the toggle click did, because
  // the `error` event doesn't care which state it interrupts.
  //
  // Neutralising the element instead of racing it: `.src` becomes an inert
  // instance property (nothing ever fetches or decodes it, so `error` can never
  // fire), `play()` resolves, `pause()` no-ops. This suite asserts store-derived
  // UI only, never real decode progress, so nothing it means to test is lost.
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
  // Signed in already, via the `app` project's `storageState`.
  await page.goto('/');
  await expect(page.getByTestId('home-page')).toBeVisible();
});

/** Opens Dune's item page and starts playback, leaving the mini player visible. */
async function startDune(page: Page) {
  await page.getByTestId('shelf-item-item-dune').click();
  await expect(page).toHaveURL(/\/item\/item-dune$/);
  await expect(page.getByTestId('item-page')).toBeVisible();
  await page.getByTestId('item-play').click();
  await expect(page.getByTestId('mini-player')).toBeVisible();
}

test('starting a book from its item page shows the mini player with that book’s title', async ({
  page,
}) => {
  await startDune(page);

  await expect(page.getByTestId('mini-player-title')).toContainText('Dune');
});

test('the mini player’s toggle switches its own aria-label between Play and Pause', async ({
  page,
}) => {
  await startDune(page);

  const toggle = page.getByTestId('mini-player-play-toggle');
  // `item-play` calls `play()` itself, so playback starts in the "playing" state.
  await expect(toggle).toHaveAttribute('aria-label', 'Pause');

  // One clean transition, not a rapid back-and-forth toggle: keeps this test
  // reading as "pause, then check", not a stress test of the toggle button.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-label', 'Play');
});

test('expanding the mini player opens Now Playing, and its close control dismisses it', async ({
  page,
}) => {
  // Medium width: a mini player plus a dismissible Now Playing sheet, rather
  // than the always-open persistent panel the expanded breakpoint shows.
  await page.setViewportSize({ width: 900, height: 900 });
  await startDune(page);

  await expect(page.getByTestId('now-playing')).toHaveCount(0);
  await page.getByTestId('mini-player-expand').click();
  await expect(page.getByTestId('now-playing')).toBeVisible();

  await page.getByTestId('now-playing-close').click();
  await expect(page.getByTestId('now-playing')).toHaveCount(0);
});

test('clicking a chapter seeks: elapsed updates and the chapter list marks it current', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await startDune(page);
  await page.getByTestId('mini-player-expand').click();

  await expect(page.getByTestId('player-elapsed')).toHaveText('0:00');

  // "Part Two" starts at 630s = 10:30.
  await page.getByTestId('chapter-item-2').click();

  await expect(page.getByTestId('player-elapsed')).toHaveText('10:30');
  await expect(page.getByTestId('chapter-item-2')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('chapter-item-1')).not.toHaveAttribute('aria-current', 'true');
});

test('skip forward then skip back returns the elapsed label to where it started', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await startDune(page);
  await page.getByTestId('mini-player-expand').click();

  const elapsed = page.getByTestId('player-elapsed');
  await expect(elapsed).toHaveText('0:00');

  // Default skip interval is 30s both directions (settingsStore.ts).
  await page.getByTestId('player-skip-forward').click();
  await expect(elapsed).toHaveText('0:30');

  await page.getByTestId('player-skip-back').click();
  await expect(elapsed).toHaveText('0:00');
});

test('the speed control steps up and down and clamps at 2x and 0.75x', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await startDune(page);
  await page.getByTestId('mini-player-expand').click();

  const rate = page.getByTestId('player-rate');
  await expect(rate).toHaveText('1x');

  for (let i = 0; i < 10; i += 1) {
    await page.getByTestId('player-rate-increase').click();
  }
  await expect(rate).toHaveText('2x');

  for (let i = 0; i < 10; i += 1) {
    await page.getByTestId('player-rate-decrease').click();
  }
  await expect(rate).toHaveText('0.75x');
});

test('adding a bookmark lists it; removing it empties the list', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await startDune(page);
  await page.getByTestId('mini-player-expand').click();

  await expect(page.getByTestId('bookmark-list')).toHaveCount(0);

  await page.getByTestId('bookmark-add').click();
  const list = page.getByTestId('bookmark-list');
  await expect(list).toBeVisible();
  await expect(list.locator('[data-testid^="bookmark-item-"]')).toHaveCount(1);

  await list.locator('[data-testid^="bookmark-remove-"]').click();
  await expect(page.getByTestId('bookmark-list')).toHaveCount(0);
});

test('a phone viewport docks the mini player above the bottom bar; a desktop viewport puts Now Playing in the persistent side panel', async ({
  page,
}) => {
  await startDune(page);

  await page.setViewportSize({ width: 480, height: 900 });
  await expect(page.getByTestId('shell')).toHaveAttribute('data-breakpoint', 'compact');
  await expect(page.getByTestId('mini-player')).toBeVisible();
  await expect(page.getByTestId('nav-bar')).toBeVisible();
  const miniBox = await page.getByTestId('mini-player').boundingBox();
  const navBarBox = await page.getByTestId('nav-bar').boundingBox();
  if (!miniBox || !navBarBox) {
    throw new Error('Expected bounding boxes for both the mini player and the bottom bar.');
  }
  // "Docked above" — the mini player's top edge sits higher on the page (a
  // smaller y) than the bottom bar's.
  expect(miniBox.y).toBeLessThan(navBarBox.y);

  await page.setViewportSize({ width: 1400, height: 900 });
  await expect(page.getByTestId('shell')).toHaveAttribute('data-breakpoint', 'expanded');
  await expect(page.getByTestId('now-playing-panel').getByTestId('now-playing')).toBeVisible();
});
