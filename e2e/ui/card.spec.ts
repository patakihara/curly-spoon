import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Card', () => {
  test('renders elevated, filled and outlined variants', async ({ page }) => {
    await expect(page.getByTestId('card-elevated')).toBeVisible();
    await expect(page.getByTestId('card-filled')).toBeVisible();
    await expect(page.getByTestId('card-outlined')).toBeVisible();
  });

  test('a static card is not a button and has no interactive semantics', async ({ page }) => {
    const card = page.getByTestId('card-elevated');
    const tagName = await card.evaluate((el) => el.tagName.toLowerCase());
    expect(tagName).toBe('div');
  });

  test('an interactive card is a real, keyboard-operable button', async ({ page }) => {
    const card = page.getByTestId('card-interactive');
    const tagName = await card.evaluate((el) => el.tagName.toLowerCase());
    expect(tagName).toBe('button');
    await card.focus();
    await expect(card).toBeFocused();
  });

  test('an elevated card resolves Sonora surface/text colours in both themes', async ({ page }) => {
    // Wave 16c-1 (docs/ROADMAP.md §16): proves the --surface-card/--surface-fg tokens
    // resolved to *used* values (getComputedStyle), not just that a var() reference was
    // written — a component can render completely unstyled and still pass every
    // testid/text-based assertion elsewhere in this file.
    const card = page.getByTestId('card-elevated');

    await expect(page.getByTestId('mode-dark')).toBeVisible();
    const darkBg = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
    const darkColor = await card.evaluate((el) => getComputedStyle(el).color);
    expect(darkBg).toBe('rgb(20, 20, 20)'); // --surface-card, dark
    expect(darkColor).toBe('rgb(225, 225, 225)'); // --surface-fg, dark

    await page.getByTestId('mode-light').click();
    await page.waitForTimeout(700);
    const lightBg = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
    const lightColor = await card.evaluate((el) => getComputedStyle(el).color);
    expect(lightBg).toBe('rgb(225, 225, 225)'); // --surface-card, light
    expect(lightColor).toBe('rgb(25, 25, 25)'); // --surface-fg, light

    // restore for other tests sharing this worker's page context
    await page.getByTestId('mode-dark').click();
  });
});
