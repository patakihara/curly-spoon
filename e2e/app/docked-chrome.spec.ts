/**
 * Wave 16d-W-1 (docs/HANDOVER.md — Sofia's own bug report: "the side navbar and the
 * 'now playing' sidebar both scrolled with the main content"). Playwright here asserts
 * on testids and text, never computed styles, so a testid-presence check would pass on
 * the pre-fix shell just as happily as the fixed one — `.auralis-shell__content` existed
 * before this wave too, it just had no `overflow` rule and the whole document scrolled
 * instead. What actually discriminates fixed from broken is *behaviour*: scroll the
 * content, and check whether the chrome moved.
 *
 * Every test here first proves its own precondition — that scrolling the content region
 * actually moved something — before asserting the chrome didn't. Skipping that check is
 * exactly how a test can pass vacuously on a broken shell (nothing scrolls, so nothing
 * that could move an element ever runs, so the "unchanged" assertion is trivially true).
 */
import { expect, test, type Page } from '@playwright/test';

async function scrollTopOf(page: Page, testId: string): Promise<number> {
  return page.getByTestId(testId).evaluate((el) => el.scrollTop);
}

async function scrollContent(page: Page, byPx: number): Promise<void> {
  await page.getByTestId('shell-content').evaluate((el, top) => {
    el.scrollTop = top;
  }, byPx);
}

test.describe('docked chrome stays put while content scrolls', () => {
  test('at expanded width (1440x900), the rail and the Now Playing panel do not move when content scrolls', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const rail = page.getByTestId('nav-rail-expanded');
    const panel = page.getByTestId('now-playing-panel');
    await expect(rail).toBeVisible();
    await expect(panel).toBeVisible();
    // Home's shelves render asynchronously; wait for real content before measuring.
    await expect(page.getByTestId('quick-picks-grid')).toBeVisible();

    // Precondition: the content region must actually be tall enough to scroll, or
    // every assertion below passes vacuously.
    const { scrollHeight, clientHeight } = await page
      .getByTestId('shell-content')
      .evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    expect(scrollHeight - clientHeight).toBeGreaterThan(100);

    const railBoxBefore = await rail.boundingBox();
    const panelBoxBefore = await panel.boundingBox();
    expect(railBoxBefore).not.toBeNull();
    expect(panelBoxBefore).not.toBeNull();

    await scrollContent(page, 400);

    // Precondition, confirmed: the content region actually moved.
    const scrollTop = await scrollTopOf(page, 'shell-content');
    expect(scrollTop).toBeGreaterThan(0);

    // The document itself must not have gained a second scrollbar — the scroll
    // happened entirely inside `.auralis-shell__content`, not on `window`/`body`.
    const documentScrollTop = await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);
    expect(documentScrollTop).toBe(0);

    const railBoxAfter = await rail.boundingBox();
    const panelBoxAfter = await panel.boundingBox();
    expect(railBoxAfter).not.toBeNull();
    expect(panelBoxAfter).not.toBeNull();

    expect(Math.abs(railBoxAfter!.y - railBoxBefore!.y)).toBeLessThan(2);
    expect(Math.abs(panelBoxAfter!.y - panelBoxBefore!.y)).toBeLessThan(2);
  });

  test('at medium width (900x800), the collapsed rail does not move when content scrolls', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/');

    const rail = page.getByTestId('nav-rail');
    await expect(rail).toBeVisible();
    await expect(page.getByTestId('quick-picks-grid')).toBeVisible();

    const { scrollHeight, clientHeight } = await page
      .getByTestId('shell-content')
      .evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    expect(scrollHeight - clientHeight).toBeGreaterThan(100);

    const railBoxBefore = await rail.boundingBox();
    expect(railBoxBefore).not.toBeNull();

    await scrollContent(page, 400);

    const scrollTop = await scrollTopOf(page, 'shell-content');
    expect(scrollTop).toBeGreaterThan(0);

    const documentScrollTop = await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);
    expect(documentScrollTop).toBe(0);

    const railBoxAfter = await rail.boundingBox();
    expect(railBoxAfter).not.toBeNull();
    expect(Math.abs(railBoxAfter!.y - railBoxBefore!.y)).toBeLessThan(2);
  });

  test('at compact width (375x800), the bottom nav bar does not move when content scrolls — the half that already worked', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');

    const navBar = page.getByTestId('nav-bar');
    await expect(navBar).toBeVisible();
    await expect(page.getByTestId('quick-picks-grid')).toBeVisible();

    const { scrollHeight, clientHeight } = await page
      .getByTestId('shell-content')
      .evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    expect(scrollHeight - clientHeight).toBeGreaterThan(100);

    const navBarBoxBefore = await navBar.boundingBox();
    expect(navBarBoxBefore).not.toBeNull();

    await scrollContent(page, 400);

    const scrollTop = await scrollTopOf(page, 'shell-content');
    expect(scrollTop).toBeGreaterThan(0);

    // Compact was chosen to also scroll via `.auralis-shell__content` (see
    // app.css's wave 16d-W-1 comment) rather than the document, so the same
    // no-second-scrollbar check applies here too.
    const documentScrollTop = await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);
    expect(documentScrollTop).toBe(0);

    const navBarBoxAfter = await navBar.boundingBox();
    expect(navBarBoxAfter).not.toBeNull();
    expect(Math.abs(navBarBoxAfter!.y - navBarBoxBefore!.y)).toBeLessThan(2);
  });
});
