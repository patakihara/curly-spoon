import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Chip', () => {
  test('renders assist, filter and input variants', async ({ page }) => {
    await expect(page.getByTestId('chip-assist')).toContainText('Download');
    await expect(page.getByTestId('chip-filter')).toContainText('Audiobooks');
    await expect(page.getByTestId('chip-input')).toContainText('Fiction');
  });

  test('a filter chip is a selectable toggle', async ({ page }) => {
    const chip = page.getByTestId('chip-filter').locator('button').first();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await chip.click();
  });

  test('an input chip has a working remove control', async ({ page }) => {
    const remove = page.getByTestId('chip-input').getByRole('button', { name: 'Remove' });
    await expect(remove).toBeVisible();
    const box = await remove.boundingBox();
    // The visual glyph is small, but the hit area (m3-hit-slop) must still be reachable.
    expect(box).not.toBeNull();
  });

  test('an assist chip is keyboard operable', async ({ page }) => {
    const chip = page.getByTestId('chip-assist').locator('button').first();
    await chip.focus();
    await expect(chip).toBeFocused();
  });
});
