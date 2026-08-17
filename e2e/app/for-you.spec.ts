/**
 * The For You view (docs/ROADMAP.md §12d): the quick-picks grid, the content-type
 * filter chips (All / Music / Podcasts / Audiobooks), and — below the grid — nothing
 * but uniform album-card carousels, one card geometry repeated for every content
 * type. Built from the user's own reference screenshots
 * (`docs/research/spec-addendum/01-for-you.jpg` through `04-for-you.jpg`, not in
 * git) — see `HomePage.tsx`'s own header for the anti-pattern (`04-for-you.jpg`:
 * a 4-column icon grid, then full-width episode cards) this view must not
 * reproduce.
 *
 * Fixture data: `apps/server/src/testSupport/fakes/fixtures/shelves.json` gives
 * `lib-books` two shelves — "Continue Listening" (`item-fellowship`) and "Recently
 * Added" (`item-fellowship`, `item-dune`, `item-hobbit`) — and `lib-podcasts` one,
 * "Newest Episodes" (`item-dailytech`). Music has no such seed data: Jellyfin's
 * favourite-albums endpoint starts empty
 * (`apps/server/src/testSupport/fakes/fakeJellyfin.ts`), so this file connects
 * Jellyfin and favourites "Driftwave" (`album-driftwave`) via
 * `/music/album/album-driftwave` first — the same route `music-favorites.spec.ts`
 * uses. Jellyfin's connect state is process-global (see `search-music.spec.ts`'s
 * header for why), so the connect step is written idempotently.
 *
 * Recommended carousels (docs/ROADMAP.md section 13, wave 13c) need their own seed:
 * GET /libraries/:id/recommended returns nothing for a cold-start user, so the last
 * test below drives listening progress through the real
 * PATCH /api/v1/progress/:itemId route (via page.request, which shares the signed-in
 * browser context's cookies) rather than a fixture default -- a module-level fixture
 * seed silently broke three unrelated server suites when wave 13b tried that
 * (docs/HANDOVER.md). item-crimson (finished) and item-emberwars1 (in progress) are
 * the exact pair apps/server/src/routes/libraries.test.ts's /recommended describe
 * block already proves produces real shelves: each shares an author/genre/series
 * with another fixture book, and neither id is referenced by any other test in this
 * file or by any other e2e/app spec, so this seed cannot collide with anything else
 * running against the same single-tenant BFF process.
 */
import { expect, type Page, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const FAKE_JELLYFIN_BASE_URL = 'http://fake.jellyfin.local';
const FAKE_JELLYFIN_USERNAME = 'nova';
const FAKE_JELLYFIN_PASSWORD = 'stardust1';

/** Mantine's `Chip` is a styled checkbox (`<input type="checkbox">` + `<label>`), not
 * a `<button>` — its input is visually zero-size/opacity:0, so Playwright's
 * actionability check refuses to click it directly. Click the label, same as a real
 * pointer would (`e2e/app/search-view.spec.ts`, `browse.spec.ts`'s sort chips). */
function clickChip(page: Page, testId: string) {
  return page.getByTestId(testId).locator('label').first().click();
}

test.beforeEach(async ({ page }) => {
  // Neutralise the audio element in case a card's navigation lands on a surface that
  // starts playback — the fixture audio can't decode in a real browser, which
  // produces two independent async reversions of the player store's "playing" state
  // (`e2e/app/player.spec.ts`'s header has the full explanation). Nothing this file
  // asserts is about real playback, so nothing is lost by disarming it up front.
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

test('connecting Jellyfin and favouriting an album, so the music carousel has data (idempotent)', async ({
  page,
}) => {
  await page.goto('/settings');
  await page.getByTestId('jellyfin-base-url-input').fill(FAKE_JELLYFIN_BASE_URL);
  await page.getByTestId('jellyfin-username-input').fill(FAKE_JELLYFIN_USERNAME);
  await page.getByTestId('jellyfin-password-input').fill(FAKE_JELLYFIN_PASSWORD);
  await page.getByTestId('jellyfin-connect-submit').click();
  await expect(page.getByTestId('jellyfin-status-connected')).toBeVisible();

  await page.goto('/music/album/album-driftwave');
  const favoriteToggle = page.getByTestId('music-album-favorite');
  await expect(favoriteToggle).toBeVisible();
  const alreadyFavorite = (await favoriteToggle.getAttribute('aria-pressed')) === 'true';
  if (!alreadyFavorite) {
    await favoriteToggle.click();
    await expect(favoriteToggle).toHaveAttribute('aria-pressed', 'true');
  }
});

test('the quick-picks grid renders above the carousels and keeps its two-column shape', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('home-page')).toBeVisible();

  const grid = page.getByTestId('quick-picks-grid');
  await expect(grid).toBeVisible();
  const tiles = page.locator('[data-testid^="quick-pick-"]:not([data-testid*="skeleton"])');
  await expect(tiles.first()).toBeVisible();

  // `buildQuickPicks` derives its tiles from `visibleCarousels`, which is
  // only fully populated once *all* of Home's independent async shelf
  // sources have resolved -- the same unreserved race docs/HANDOVER.md's
  // phase 14c documents. Reading `tiles.count()` right after only the
  // *first* tile becomes visible races that: on a slow enough load, one
  // source can have contributed before the others, understating the real
  // count for a moment. Polling for the count -- rather than waiting on any
  // one specific ordinary shelf, which pulls in that shelf's own load time
  // as an unrelated new way to time out -- retries the read itself until it
  // holds, without loosening the >=2 the test actually cares about.
  let tileCount = 0;
  await expect
    .poll(async () => {
      tileCount = await tiles.count();
      return tileCount;
    })
    .toBeGreaterThanOrEqual(2);

  // Two columns: the first two tiles sit on the same row (equal y), the third (if
  // present) sits on the next row down.
  const box0 = await tiles.nth(0).boundingBox();
  const box1 = await tiles.nth(1).boundingBox();
  expect(box0).not.toBeNull();
  expect(box1).not.toBeNull();
  expect(Math.abs(box0!.y - box1!.y)).toBeLessThan(2);
  if (tileCount >= 3) {
    const box2 = await tiles.nth(2).boundingBox();
    expect(box2!.y).toBeGreaterThan(box0!.y + box0!.height / 2);
  }

  // The grid sits above the first carousel.
  const firstCarousel = page.getByTestId('shelf-shelf-continue-listening');
  await expect(firstCarousel).toBeVisible();
  const gridBox = await grid.boundingBox();
  const carouselBox = await firstCarousel.boundingBox();
  expect(gridBox).not.toBeNull();
  expect(carouselBox).not.toBeNull();
  expect(gridBox!.y).toBeLessThan(carouselBox!.y);
});

test('every card below the grid shares one geometry, across every content type', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('shelf-shelf-continue-listening')).toBeVisible();
  await expect(page.getByTestId('shelf-shelf-new-episodes')).toBeVisible();
  await expect(page.getByTestId('shelf-music-favorite-albums')).toBeVisible();

  const cards = page.locator('[data-testid^="shelf-item-"]');
  const count = await cards.count();
  // At least one book, one podcast, one album card, given the fixture/setup above.
  expect(count).toBeGreaterThanOrEqual(3);

  const boxes = [];
  for (let i = 0; i < count; i += 1) {
    const box = await cards.nth(i).boundingBox();
    expect(box).not.toBeNull();
    boxes.push(box!);
  }

  // `noUncheckedIndexedAccess` types boxes[0] as possibly-undefined even though
  // the count assertion above rules it out. Narrow it rather than assert it away.
  const first = boxes[0];
  if (!first) throw new Error('no card bounding boxes were measured');
  const { width, height } = first;
  for (const box of boxes) {
    expect(box.width).toBeCloseTo(width, 0);
    expect(box.height).toBeCloseTo(height, 0);
  }
});

test('selecting a content-type chip filters the carousels and quick picks; "All" shows everything again', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('shelf-shelf-continue-listening')).toBeVisible();
  await expect(page.getByTestId('shelf-shelf-new-episodes')).toBeVisible();
  await expect(page.getByTestId('shelf-music-favorite-albums')).toBeVisible();

  await clickChip(page, 'for-you-filter-books');
  await expect(page.getByTestId('shelf-shelf-continue-listening')).toBeVisible();
  await expect(page.getByTestId('shelf-shelf-new-episodes')).toHaveCount(0);
  await expect(page.getByTestId('shelf-music-favorite-albums')).toHaveCount(0);

  // Quick picks narrow too — every visible tile is a book, none a podcast or album.
  const quickPickIds = await page
    .locator('[data-testid^="quick-pick-"]:not([data-testid*="skeleton"])')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
  expect(quickPickIds.length).toBeGreaterThan(0);
  for (const id of quickPickIds) {
    expect(id).not.toContain('item-dailytech');
    expect(id).not.toContain('album-driftwave');
  }

  // Toggling the same chip off (Mantine Chip toggle behaviour, same as Search's row)
  // returns to "All".
  await clickChip(page, 'for-you-filter-books');
  await expect(page.getByTestId('shelf-shelf-new-episodes')).toBeVisible();
  await expect(page.getByTestId('shelf-music-favorite-albums')).toBeVisible();
});

test('a carousel is keyboard-scrollable, and scrolling it never scrolls the page', async ({
  page,
}) => {
  // Narrow enough that "Recently Added"'s three 160px cards overflow the viewport —
  // at a default desktop width they fit with room to spare and there is nothing to
  // scroll, which would make this test pass vacuously.
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  const track = page.getByTestId('shelf-track-shelf-recently-added');
  await expect(track).toBeVisible();

  const dims = await track.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(dims.scrollWidth).toBeGreaterThan(dims.clientWidth);

  const before = await track.evaluate((el) => el.scrollLeft);
  expect(before).toBe(0);

  // `tabIndex={0}` on the track (Carousel.tsx) is what makes this possible — every
  // modern browser scrolls a focused, overflowing element on arrow-key input with
  // no extra wiring. Mouse-wheel deltaX input is exercised only by hand in a real
  // browser here — Chromium's synthetic `page.mouse.wheel` does not reliably
  // translate into scroll on an overflow-x container the way a real trackpad does.
  await track.focus();
  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press('ArrowRight');
  }
  await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);

  // The page itself never scrolled horizontally.
  const pageScrollX = await page.evaluate(() => window.scrollX);
  expect(pageScrollX).toBe(0);
  const bodyOverflowsHorizontally = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(bodyOverflowsHorizontally).toBe(false);
});

test('a loading skeleton occupies the same box as a loaded card', async ({ page }) => {
  // Diagnosed with the route handler and the DOM directly instrumented (not
  // guessed), across several rounds:
  //
  // 1. A blind `setTimeout(500)` delay before `route.continue()` does not
  //    reliably bound the loading window at all -- confirmed by logging the
  //    route handler's own timestamps against the DOM: on some runs the
  //    "books" skeleton was already gone from the DOM before the mocked
  //    500ms delay had even elapsed for the one request it's supposed to
  //    depend on, and on others the whole page snapshot at failure time
  //    shows every shelf already fully loaded, meaning real data arrived
  //    essentially immediately despite the interception being registered
  //    and (confirmed by logging `route.request().url()`) genuinely hit.
  // 2. Ruled out as the cause: `scrollbar-gutter`-style reflow (measured
  //    `.auralis-shell__content`'s `clientWidth` through the loading->loaded
  //    transition -- constant), the quick-picks grid's column count (it's a
  //    fixed `repeat(2, minmax(0,1fr))` track, not width-responsive), and
  //    the service worker (checked `navigator.serviceWorker.controller` at
  //    the point of failure -- not yet controlling the page, and the
  //    `/api/*` runtime-caching rule in `vite.config.ts` is `NetworkOnly`
  //    regardless).
  // 3. What actually explains it: gating the route open with an explicit
  //    promise the test releases only after it has captured the skeleton's
  //    box turns out to make skeleton capture 100% reliable across many
  //    repeated runs -- the remaining flake, isolated this way, is entirely
  //    in the *second* read (the loaded card's box), taken right after its
  //    own `toBeVisible()` resolves. HomePage stitches several independent
  //    async sources (books, podcasts, music, recommendations -- the same
  //    unreserved race docs/HANDOVER.md's phase 14c documents, with a real
  //    fix approved in docs/USER_DECISIONS.md but not yet implemented), and
  //    releasing two gated requests together can still let their two
  //    resulting renders land close enough together that a single
  //    synchronous `boundingBox()` call can be read between one commit and
  //    the next.
  //
  // The fix combines both findings without loosening what's asserted (the
  // exact geometry match is untouched): gate the network so the skeleton's
  // presence is guaranteed rather than raced against a clock, and poll for
  // both boxes so a transient remount doesn't fail a read that would
  // otherwise have succeeded a moment later.
  let releaseHome: () => void = () => {};
  const homeGate = new Promise<void>((resolve) => {
    releaseHome = resolve;
  });
  await page.route('**/api/v1/libraries/*/home', async (route) => {
    await homeGate;
    await route.continue();
  });

  await page.goto('/');

  const skeleton = page.getByTestId('shelf-item-skeleton-books-loading-0');
  let skeletonBox: { x: number; y: number; width: number; height: number } | null = null;
  await expect
    .poll(async () => {
      skeletonBox = await skeleton.boundingBox();
      return skeletonBox;
    })
    .not.toBeNull();

  releaseHome();

  const loadedCard = page.locator('[data-testid^="shelf-item-"]').first();
  let loadedBox: { x: number; y: number; width: number; height: number } | null = null;
  await expect
    .poll(
      async () => {
        loadedBox = await loadedCard.boundingBox();
        return loadedBox;
      },
      { timeout: 10_000 },
    )
    .not.toBeNull();

  expect(skeletonBox!.width).toBeCloseTo(loadedBox!.width, 0);
  expect(skeletonBox!.height).toBeCloseTo(loadedBox!.height, 0);
});

test('recommended carousels appear below the ordinary shelves, each with a visible reason line', async ({
  page,
}) => {
  // Seed listening history through the real API -- see this file's header for why a
  // fixture default is the wrong tool here. PATCH sets an absolute progress value,
  // so re-running this test (or another test file re-running the same server
  // process) is harmless.
  const finished = await page.request.patch('/api/v1/progress/item-crimson', {
    data: { currentTime: 500, duration: 500, progress: 1, isFinished: true },
  });
  expect(finished.ok()).toBe(true);
  const inProgress = await page.request.patch('/api/v1/progress/item-emberwars1', {
    data: { currentTime: 240, duration: 600, progress: 0.4, isFinished: false },
  });
  expect(inProgress.ok()).toBe(true);

  await page.goto('/');
  await expect(page.getByTestId('home-page')).toBeVisible();

  // The ordinary shelves this file's other tests already assert on are still there
  // -- appending never displaces them. `shelf-music-favorite-albums` is the last
  // ordinary carousel HomePage.tsx renders (book, then podcast, then music, then
  // recommended appended last -- forYouFeed.ts's `buildForYouCarousels`), so it is
  // the correct "everything ordinary is above this line" reference point, not
  // whichever ordinary shelf happens to be declared first in this file.
  const lastOrdinaryShelf = page.getByTestId('shelf-music-favorite-albums');
  await expect(lastOrdinaryShelf).toBeVisible();
  const lastOrdinaryBox = await lastOrdinaryShelf.boundingBox();
  expect(lastOrdinaryBox).not.toBeNull();

  // Recommended shelf ids are `shelf-<kind>-<slug>` (`shelves.ts`'s `labelFor`/
  // `reasonFor` cover all four `AffinityKind`s: genre, author, narrator, series) --
  // which specific kind(s) the scorer picks for this seed isn't something this test
  // pins down, only that at least one recommended shelf renders.
  const recommendedShelves = page.locator(
    'section[data-testid^="shelf-shelf-genre-"], ' +
      'section[data-testid^="shelf-shelf-author-"], ' +
      'section[data-testid^="shelf-shelf-narrator-"], ' +
      'section[data-testid^="shelf-shelf-series-"]',
  );
  await expect(recommendedShelves.first()).toBeVisible({ timeout: 10_000 });
  const recommendedCount = await recommendedShelves.count();
  expect(recommendedCount).toBeGreaterThan(0);

  // Every recommended shelf sits below the ordinary shelf measured above, and each
  // carries a visible, non-empty reason line as the section's second child.
  for (let i = 0; i < recommendedCount; i += 1) {
    const shelf = recommendedShelves.nth(i);
    const shelfBox = await shelf.boundingBox();
    expect(shelfBox).not.toBeNull();
    expect(shelfBox!.y).toBeGreaterThan(lastOrdinaryBox!.y);

    const testId = await shelf.getAttribute('data-testid');
    const reason = page.getByTestId(`shelf-reason-${testId!.replace('shelf-', '')}`);
    await expect(reason).toBeVisible();
    const reasonText = await reason.textContent();
    expect(reasonText).not.toBeNull();
    expect(reasonText!.trim().length).toBeGreaterThan(0);
  }
});

test('an ordinary shelf never renders a reason line', async ({ page }) => {
  await page.goto('/');
  const ordinaryShelf = page.getByTestId('shelf-shelf-continue-listening');
  await expect(ordinaryShelf).toBeVisible();
  // Absence, not merely empty text: `Carousel.tsx` renders no `<p>` at all when
  // `reason` is undefined, rather than an empty one -- an empty node would still
  // occupy layout space and would still be found by a `data-testid` locator with
  // `toHaveCount(0)`, so this is the correct way to assert the negative.
  await expect(ordinaryShelf.getByTestId('shelf-reason-shelf-continue-listening')).toHaveCount(0);
});
