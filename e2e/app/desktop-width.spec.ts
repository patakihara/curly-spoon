/**
 * Desktop shell width (docs/HANDOVER.md, "Desktop shell width pass"): at 1440px the
 * content column stayed roughly mobile-proportioned, leaving a large empty gap before
 * the Now Playing rail. Measurement (not guesswork) traced the visible gap to two
 * separate things, both fixed together here:
 *
 * 1. `shellLayout.ts`'s `contentMaxWidth()` and `app.css`'s `.auralis-page` rule — the
 *    content column itself was already using the space available to it (900 of 1440,
 *    after the 220px rail and 320px Now Playing panel), so a shell-only fix would leave
 *    the 1440 screenshot unchanged. The real, if smaller, shell bug is at very wide
 *    viewports: `.auralis-page`'s old bare `max-width: 1200px` had no centering, so once
 *    a viewport was wide enough for the cap to bind, 100% of the leftover gutter landed
 *    on the right, against the Now Playing panel, instead of splitting evenly.
 * 2. `HomePage.tsx`'s quick-pick tiles (`QUICK_TILE_STYLE`) didn't stretch to fill their
 *    CSS Grid cell — a `<button>` shrink-wraps to its content's width by default even
 *    with `display: flex` set on itself. This is what actually produced the "stops at
 *    x≈935" gap reported at 1440px; assertion 1 below is the one that would fail without
 *    the `width: '100%'` fix landing alongside the shell change.
 *
 * Assertion 1 is deliberately on the *tile*, not just the column: a column-only
 * assertion is already true on the pre-fix build (900/1440 is a reasonable proportion)
 * and would pass whether or not the real bug was fixed — see this file's header in the
 * agent spec for why that would be a tautological test.
 */
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  // Same neutralisation as e2e/app/for-you.spec.ts: nothing here is about playback, and
  // the fixture audio can't decode in a real browser.
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

test('at 1440px, a quick-pick tile fills its grid column instead of shrink-wrapping its content', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const grid = page.getByTestId('quick-picks-grid');
  await expect(grid).toBeVisible();
  const gridBox = await grid.boundingBox();
  expect(gridBox).toBeTruthy();

  const firstTile = page.getByTestId(/^quick-pick-(?!skeleton)/).first();
  await expect(firstTile).toBeVisible();
  const tileBox = await firstTile.boundingBox();
  expect(tileBox).toBeTruthy();

  // Two columns, 8px gap (HomePage.tsx's QUICK_GRID_STYLE): each column is
  // (gridWidth - 8) / 2 wide. A tile that merely shrink-wraps its label+cover content
  // (the pre-fix bug) measures well under half the grid's width — assert it is within a
  // few px of the true column width instead, which only passes once the tile actually
  // stretches to fill its cell.
  const expectedColumnWidth = (gridBox!.width - 8) / 2;
  expect(tileBox!.width).toBeGreaterThan(expectedColumnWidth - 4);
});

test('at 1440px, the content column occupies most of the space left after the rail and Now Playing panel', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const rail = page.getByTestId('nav-rail-expanded');
  await expect(rail).toBeVisible();
  const railBox = await rail.boundingBox();

  const content = page.getByTestId('shell-content');
  const contentBox = await content.boundingBox();
  expect(contentBox).toBeTruthy();

  // The shell reserves the rail (220px, expanded) and a fixed-width Now Playing panel
  // (320px, app.css's `.auralis-now-playing-panel`) — what's left for content is
  // 1440 - 220 - 320 = 900px. Assert the content column claims essentially all of that,
  // rather than stopping well short of it as though still on a phone-width layout.
  const available = 1440 - railBox!.width - 320;
  expect(contentBox!.width).toBeGreaterThan(available - 4);

  // The visible page content, not just the flex column around it, should reach close to
  // the same right edge — this is what would catch a regression where the column itself
  // is wide but a max-width or missing stretch inside it holds the real content narrow.
  const pageEl = page.locator('.auralis-page').first();
  const pageBox = await pageEl.boundingBox();
  expect(pageBox).toBeTruthy();
  expect(pageBox!.x + pageBox!.width).toBeGreaterThan(contentBox!.x + contentBox!.width - 60);
});

test('at 1920px, the content column is centered and capped rather than stretching edge to edge', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto('/');

  const content = page.getByTestId('shell-content');
  const contentBox = await content.boundingBox();
  const pageEl = page.locator('.auralis-page').first();
  const pageBox = await pageEl.boundingBox();
  expect(contentBox).toBeTruthy();
  expect(pageBox).toBeTruthy();

  // contentMaxWidth() (shellLayout.ts) caps `.auralis-page` well under the ~1380px
  // available at this width, so a large gutter is expected here — the point of this
  // test is that it's split roughly evenly on both sides, not dumped entirely on the
  // side facing the Now Playing panel (the bug the un-centered `max-width: 1200px`
  // rule had before this fix).
  const leftGutter = pageBox!.x - contentBox!.x;
  const rightGutter = contentBox!.x + contentBox!.width - (pageBox!.x + pageBox!.width);
  expect(pageBox!.width).toBeLessThan(contentBox!.width - 20);
  expect(Math.abs(leftGutter - rightGutter)).toBeLessThan(4);
});

test('at 390px, the layout is unchanged in shape: no rail, tiles still fill their column, no overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');

  await expect(page.getByTestId('nav-rail-expanded')).toHaveCount(0);
  await expect(page.getByTestId('nav-rail')).toHaveCount(0);
  await expect(page.getByTestId('nav-bar')).toBeVisible();

  const grid = page.getByTestId('quick-picks-grid');
  await expect(grid).toBeVisible();
  const gridBox = await grid.boundingBox();
  const firstTile = page.getByTestId(/^quick-pick-(?!skeleton)/).first();
  const tileBox = await firstTile.boundingBox();
  const expectedColumnWidth = (gridBox!.width - 8) / 2;
  expect(tileBox!.width).toBeGreaterThan(expectedColumnWidth - 4);

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(390);
});

for (const width of [390, 834, 1440, 1920]) {
  test(`at ${width}px, the page never scrolls horizontally`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('shell-content')).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(width);
  });
}
