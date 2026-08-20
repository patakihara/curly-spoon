import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('SearchField', () => {
  test('is wired as a combobox', async ({ page }) => {
    const input = page.getByTestId('search-field').locator('input');
    await expect(input).toHaveAttribute('role', 'combobox');
    await expect(input).toHaveAttribute('aria-autocomplete', 'list');
    await expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  test('typing opens the suggestion listbox', async ({ page }) => {
    const field = page.getByTestId('search-field');
    const input = field.locator('input');
    await input.fill('Pir');
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    await expect(field.getByRole('listbox')).toBeVisible();
    await expect(field.getByRole('option')).toHaveCount(3);
  });

  test('ArrowDown moves aria-activedescendant through suggestions, Enter selects', async ({
    page,
  }) => {
    const field = page.getByTestId('search-field');
    const input = field.locator('input');
    await input.fill('a');
    await page.keyboard.press('ArrowDown');
    const firstOptionId = await field.getByRole('option').first().getAttribute('id');
    await expect(input).toHaveAttribute('aria-activedescendant', firstOptionId!);

    await page.keyboard.press('Enter');
    await expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  test('the suggestion listbox is height-bounded and scrolls rather than growing without limit', async ({
    page,
  }) => {
    const field = page.getByTestId('search-field');
    await field.locator('input').fill('a');

    const listbox = field.getByRole('listbox');
    await expect(listbox).toBeVisible();

    // `SearchField` deliberately uses Mantine's raw `Combobox` rather than `Select`/`Autocomplete`,
    // so suggestion labels can be arbitrary `ReactNode`s. The cost is that `maxDropdownHeight` —
    // which lives on the higher-level `ComboboxLikeProps` API — does not apply, and the options
    // list grows without bound. Unbounded, a full suggestion list swallows whatever sits beneath
    // the field. This asserts the cap exists at all; without the CSS rule both reads are 'none'.
    const { maxHeight, overflowY } = await listbox.evaluate((node) => {
      const style = getComputedStyle(node);
      return { maxHeight: style.maxHeight, overflowY: style.overflowY };
    });
    expect(maxHeight).not.toBe('none');
    expect(Number.parseFloat(maxHeight)).toBeGreaterThan(0);
    expect(overflowY).toBe('auto');
  });

  test('the clear button empties the field and returns focus to it', async ({ page }) => {
    const field = page.getByTestId('search-field');
    const input = field.locator('input');
    await input.fill('lyrics');
    await field.getByRole('button', { name: 'Clear search' }).click();
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
  });
});
