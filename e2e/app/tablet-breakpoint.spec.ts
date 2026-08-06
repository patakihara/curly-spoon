/**
 * The 600–1240px tablet range (`medium` in `hooks/breakpoint.ts`) — the one
 * gap `docs/ROADMAP.md` §10 named as unaudited after the desktop (1280x900)
 * and phone (390x844) design-audit passes. `player.spec.ts` already pins the
 * mini player's click-through behaviour at 900px; this file adds the widths
 * that weren't checked anywhere (768, 1024, 1200) plus a horizontal-overflow
 * and grid-density sweep across the whole range on the pages the earlier
 * audits covered at other widths (home, search, an item detail page, Music).
 *
 * A real browser pass (screenshots, `getComputedStyle`/`boundingBox`, and
 * clicks — see `docs/HANDOVER.md`'s "geometry assertions cannot see a
 * stacking bug" lesson) at 600/768/900/1024/1200px found no new layout
 * defects: the medium mini-player docking fix (`1925402`) already covers this
 * whole range, not just 900px, and `.auralis-card-grid`'s
 * `repeat(auto-fill, minmax(200px, 1fr))` produces 2–5 sensible columns
 * (card widths measured 200–250px, never a single giant column or an
 * unreadable six-up) across it too. The tests below are the honest
 * revert-guards for what was actually observed, not a redesign.
 *
 * One real defect *was* found this pass, unrelated to the breakpoint itself:
 * `ItemPage.tsx` (book detail) and `PodcastDetailPage.tsx` (podcast detail)
 * both rendered their cover as a bare `<img>`, so failed artwork fell through
 * to the browser's native broken-image glyph instead of the tonal fallback
 * `CoverImage` already gives Home's shelf cards and every Music surface
 * (`docs/ROADMAP.md`'s 2026-08-06 mini-player entry names this exact pattern
 * for `MiniPlayer`, which had already been fixed by the time this wave
 * started — these two detail pages had not). Both now go through the shared
 * `CoverImage` component.
 */
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Same neutralisation `player.spec.ts` uses — see that file's header. The
  // mini-player click-through tests below start real (fake) playback.
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

const TABLET_WIDTHS = [600, 768, 900, 1024, 1200];

for (const width of TABLET_WIDTHS) {
  test(`no horizontal overflow on Home at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('home-page')).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(width);
  });
}

// Widths `player.spec.ts` doesn't already cover at 900px — the docking fix's
// own comment (app.css) says it holds across the whole medium range, and this
// is what proves that rather than assuming it from the one width already
// pinned elsewhere.
for (const width of [768, 1024, 1200]) {
  test(`the docked mini player spans the rail's edge to the viewport, and stays clickable, at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await page.getByTestId('shelf-item-item-dune').click();
    await expect(page).toHaveURL(/\/item\/item-dune$/);
    await page.getByTestId('item-play').click();
    await expect(page.getByTestId('mini-player')).toBeVisible();

    const rail = page.getByTestId('nav-rail');
    const railBox = await rail.boundingBox();
    const mpBox = await page.getByTestId('mini-player').boundingBox();
    if (!railBox || !mpBox) throw new Error('rail or mini player not visible');

    // Docked flush to the rail's right edge, spanning to the viewport's right
    // edge — the "anchored to the rail's edge" reading `app.css`'s medium rule
    // documents, not overlapping the rail and not stopping short of the
    // viewport.
    expect(mpBox.x).toBeCloseTo(railBox.width, 0);
    expect(mpBox.x + mpBox.width).toBeCloseTo(width, 0);

    // Assert by clicking, not by measuring (docs/HANDOVER.md: geometry
    // assertions passed the broken version once already — Mantine's
    // `AppShellNavbar` painted over the mini player at z-index 101 while
    // every bounding box still measured correct).
    const toggle = page.getByTestId('mini-player-play-toggle');
    await expect(toggle).toHaveAttribute('aria-label', 'Pause');
    const toggleBox = await toggle.boundingBox();
    if (!toggleBox) throw new Error('toggle not visible');
    await page.mouse.click(toggleBox.x + toggleBox.width / 2, toggleBox.y + toggleBox.height / 2);
    await expect(toggle).toHaveAttribute('aria-label', 'Play');
  });
}

for (const width of TABLET_WIDTHS) {
  test(`the Music artist grid renders a sane column count (not one giant column or an unreadable six-up) at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/settings');
    const alreadyConnected = await page
      .getByTestId('jellyfin-status-connected')
      .isVisible()
      .catch(() => false);
    if (!alreadyConnected) {
      await page.getByTestId('jellyfin-base-url-input').fill('http://fake.jellyfin.local');
      await page.getByTestId('jellyfin-username-input').fill('nova');
      await page.getByTestId('jellyfin-password-input').fill('stardust1');
      await page.getByTestId('jellyfin-connect-submit').click();
      await expect(page.getByTestId('jellyfin-status-connected')).toBeVisible();
    }

    await page.goto('/music');
    await expect(page.getByTestId('music-page')).toBeVisible();

    const cardWidth = await page.evaluate(() => {
      const grid = document.querySelector('.auralis-card-grid');
      const card = grid?.firstElementChild as HTMLElement | undefined;
      return card ? card.getBoundingClientRect().width : null;
    });
    expect(cardWidth).not.toBeNull();
    // minmax(200px, 1fr): never below its own floor, never so wide a single
    // card reads as an empty page (measured 200-250px across this whole
    // range in the real-browser pass this test pins).
    expect(cardWidth as number).toBeGreaterThanOrEqual(199);
    expect(cardWidth as number).toBeLessThanOrEqual(320);
  });
}

/** Forces the cover request to fail so the fallback path is exercised
 * deterministically — the fake-upstream fixture bytes are synthetic
 * `image/jpeg`-labelled noise (docs/HANDOVER.md's environment note) that a
 * real browser usually can't decode either, but relying on that would make
 * this test's pass/fail depend on fixture content rather than on the
 * component's own `onError` handling. */
async function forceCoverLoadFailure(page: Page) {
  await page.route('**/api/v1/media/*/cover**', (route) => route.abort());
}

test('the book detail page falls back to a tonal icon, not the browser glyph, when its cover fails to load', async ({
  page,
}) => {
  await forceCoverLoadFailure(page);
  await page.goto('/item/item-dune');
  await expect(page.getByTestId('item-page')).toBeVisible();

  // The fallback is a plain `aria-hidden` tile, not an `<img>` — asserting no
  // `<img>` remains in the header is what would fail against the old bare
  // `<img>` (which stays in the DOM, broken, on error) and passes now that
  // `CoverImage` swaps to `CoverImageFallback` on `onError`.
  const header = page.locator('.auralis-item-header');
  await expect(header.locator('img')).toHaveCount(0);
  await expect(header.locator('svg, [aria-hidden="true"]').first()).toBeVisible();
});

test('the podcast detail page falls back to a tonal icon, not the browser glyph, when its cover fails to load', async ({
  page,
}) => {
  await forceCoverLoadFailure(page);
  await page.goto('/podcast/item-dailytech');
  await expect(page.getByTestId('podcast-detail-page')).toBeVisible();

  const header = page.locator('.auralis-item-header');
  await expect(header.locator('img')).toHaveCount(0);
  await expect(header.locator('svg, [aria-hidden="true"]').first()).toBeVisible();
});
