import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Icon', () => {
  test('renders every named icon as inline SVG (no icon font, no network image)', async ({
    page,
  }) => {
    const grid = page.getByTestId('icon-grid');
    const svgCount = await grid.locator('svg').count();
    expect(svgCount).toBeGreaterThanOrEqual(43);
  });

  test('a titled icon is exposed to the accessibility tree with its name', async ({ page }) => {
    const playIcon = page.getByTestId('icon-play').locator('svg');
    await expect(playIcon).toHaveAttribute('role', 'img');
    await expect(playIcon.locator('title')).toHaveText('play');
  });

  test('no icon request ever hits the network (all are inline SVG paths)', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (req) => {
      if (/\.(svg|png|jpg|jpeg|webp|gif)(\?|$)/i.test(req.url())) requests.push(req.url());
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(requests).toEqual([]);
  });

  test('a fillable glyph renders different path data filled vs. outlined', async ({ page }) => {
    // `explore` has a real FILL-axis visual difference in Material Symbols Rounded (the
    // outline form adds a ring path the filled form doesn't have) — this is the assertion
    // that would fail if `filled={false}` were wired to the same source as the filled form,
    // where an "an icon rendered" check alone would pass either way.
    const filledPath = await page.getByTestId('icon-explore').locator('svg path').getAttribute('d');
    const outlinePath = await page
      .getByTestId('icon-outline-explore')
      .locator('svg path')
      .getAttribute('d');
    expect(filledPath).toBeTruthy();
    expect(outlinePath).toBeTruthy();
    expect(outlinePath).not.toBe(filledPath);
  });

  test('a titled outline icon is exposed to the accessibility tree', async ({ page }) => {
    const albumOutline = page.getByTestId('icon-outline-album').locator('svg');
    await expect(albumOutline).toHaveAttribute('role', 'img');
    await expect(albumOutline.locator('title')).toHaveText('album outline');
  });
});
