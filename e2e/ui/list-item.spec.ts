import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('ListItem', () => {
  test('renders 1, 2 and 3-line layouts', async ({ page }) => {
    await expect(page.getByTestId('list-item-1-line')).toContainText('One line');
    await expect(page.getByTestId('list-item-2-line')).toContainText('Supporting text');
    await expect(page.getByTestId('list-item-3-line')).toContainText('Overline');
  });

  test('renders leading and trailing slots', async ({ page }) => {
    const item = page.getByTestId('list-item-3-line');
    await expect(item.locator('.m3-list-item__leading svg')).toBeVisible();
    await expect(item.locator('.m3-list-item__trailing svg')).toBeVisible();
  });

  test('selected item exposes aria-current', async ({ page }) => {
    await expect(page.getByTestId('list-item-selected')).toHaveAttribute('aria-current', 'true');
  });

  test('meets the 48px touch target and is keyboard focusable', async ({ page }) => {
    const item = page.getByTestId('list-item-1-line');
    const box = await item.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(48);
    await item.focus();
    await expect(item).toBeFocused();
  });
});
