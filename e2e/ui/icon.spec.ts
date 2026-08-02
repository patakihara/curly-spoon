import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Icon', () => {
  test('renders every named icon as inline SVG (no icon font, no network image)', async ({ page }) => {
    const grid = page.getByTestId('icon-grid');
    const svgCount = await grid.locator('svg').count();
    expect(svgCount).toBeGreaterThanOrEqual(29);
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
});
