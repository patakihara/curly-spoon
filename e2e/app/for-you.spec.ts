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
  const tileCount = await tiles.count();
  expect(tileCount).toBeGreaterThanOrEqual(2);

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

  const { width, height } = boxes[0];
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
  await page.route('**/api/v1/libraries/*/home', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });

  await page.goto('/');

  const skeleton = page.getByTestId('shelf-item-skeleton-books-loading-0');
  await expect(skeleton).toBeVisible();
  const skeletonBox = await skeleton.boundingBox();
  expect(skeletonBox).not.toBeNull();

  const loadedCard = page.locator('[data-testid^="shelf-item-"]').first();
  await expect(loadedCard).toBeVisible({ timeout: 10_000 });
  const loadedBox = await loadedCard.boundingBox();
  expect(loadedBox).not.toBeNull();

  expect(skeletonBox!.width).toBeCloseTo(loadedBox!.width, 0);
  expect(skeletonBox!.height).toBeCloseTo(loadedBox!.height, 0);
});
