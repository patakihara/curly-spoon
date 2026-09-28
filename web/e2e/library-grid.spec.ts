import { expect, test } from '@playwright/test';

/**
 * The library homes' grids: 3 across on a phone, and on desktop as wide as the front layer at
 * every layout, Sonora's LayoutGrid deciding how many columns that is.
 */
const HOMES = ['/music', '/books', '/podcasts'];
/** One width per layout in nav.json: bottom bar, icon rail, labelled rail, and the panel's. */
const DESKTOP = [600, 1024, 1240, 1440, 1920];

/** The home's first card grid: its columns, and how far they and the grid fall short of the front layer. */
function measure() {
  const grid = [...document.querySelectorAll('div')].find(
    (d) => getComputedStyle(d).display === 'grid' && d.querySelector('img') !== null,
  );
  if (grid === undefined) throw new Error('no card grid');
  let scroller = grid.parentElement;
  while (scroller !== null && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) {
    scroller = scroller.parentElement;
  }
  if (scroller === null) throw new Error('the grid is not in the front layer');
  const style = getComputedStyle(grid);
  const tracks = style.gridTemplateColumns.split(' ').map(parseFloat);
  const gap = parseFloat(style.columnGap);
  const box = grid.getBoundingClientRect();
  const pane = scroller.getBoundingClientRect();
  return {
    columns: tracks.length,
    /** What the columns and their gaps leave empty at the grid's end. */
    unfilled: box.width - tracks.reduce((a, b) => a + b, 0) - gap * (tracks.length - 1),
    /** The grid's distance from the front layer's end, which is the page margin when it fills. */
    fromEnd: pane.right - box.right,
    margin: box.left - pane.left,
  };
}

for (const home of HOMES) {
  test(`[M0.canvas] ${home} shows its library 3 across on a phone`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(home);
    await page.locator('img').first().waitFor();
    const grid = await page.evaluate(measure);
    expect(grid.columns).toBe(3);
    expect(grid.unfilled).toBeLessThan(1);
  });

  for (const width of DESKTOP) {
    test(`[M0.canvas] ${home} fills the front layer's width with its grid at ${width} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(home);
      await page.locator('img').first().waitFor();
      const grid = await page.evaluate(measure);
      expect(grid.columns).toBeGreaterThanOrEqual(3);
      expect(grid.unfilled).toBeLessThan(1);
      expect(Math.abs(grid.fromEnd - grid.margin)).toBeLessThan(1);
    });
  }
}
