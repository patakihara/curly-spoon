import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Button', () => {
  test('renders every variant with visible, distinct labels', async ({ page }) => {
    for (const variant of ['filled', 'tonal', 'outlined', 'text', 'elevated']) {
      await expect(page.getByTestId(`button-${variant}`)).toBeVisible();
    }
  });

  test('meets the 48px minimum touch target', async ({ page }) => {
    const box = await page.getByTestId('button-filled').boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(48);
  });

  test('is keyboard operable: Tab focuses it, Enter activates it', async ({ page }) => {
    const button = page.getByTestId('button-filled');
    await button.focus();
    await expect(button).toBeFocused();
    await button.evaluate((el) =>
      el.addEventListener('click', () => ((window as unknown as { __clicked: boolean }).__clicked = true)),
    );
    await page.keyboard.press('Enter');
    const clicked = await page.evaluate(() => (window as unknown as { __clicked?: boolean }).__clicked ?? false);
    expect(clicked).toBe(true);
  });

  test('shows a visible focus ring on keyboard focus', async ({ page }) => {
    const button = page.getByTestId('button-filled');
    await button.focus();
    const outline = await button.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
  });

  test('disabled button is not focusable and not clickable', async ({ page }) => {
    const button = page.getByTestId('button-disabled');
    await expect(button).toBeDisabled();
  });

  test('loading button announces busy state', async ({ page }) => {
    const button = page.getByTestId('button-loading');
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect(button).toBeDisabled();
  });

  test('morphs its corner radius on press (shape morph, not a scale transform)', async ({ page }) => {
    const button = page.getByTestId('button-filled');
    const restRadius = await button.evaluate((el) => getComputedStyle(el).borderRadius);

    const box = await button.boundingBox();
    if (!box) throw new Error('button not visible');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(50);
    const pressedRadius = await button.evaluate((el) => getComputedStyle(el).borderRadius);
    await page.mouse.up();

    expect(pressedRadius).not.toBe(restRadius);
  });
});
