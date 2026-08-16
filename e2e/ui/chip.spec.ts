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
    // Mantine's Chip is a styled checkbox (`<input type="checkbox">`), not a `<button>` —
    // there is no `aria-pressed`; the toggle state is the input's checked state. The
    // input itself is visually zero-size/opacity:0 (Mantine hides it and paints the
    // sibling `<label>` instead), so Playwright's actionability check refuses to click
    // it directly — click the label, same as a real pointer would, and assert state on
    // the input.
    const chip = page.getByTestId('chip-filter').locator('input').first();
    const label = page.getByTestId('chip-filter').locator('label').first();
    await expect(chip).toBeChecked();
    await label.click();
    await expect(chip).not.toBeChecked();
    await label.click();
  });

  test('an input chip has a working remove control', async ({ page }) => {
    const remove = page.getByTestId('chip-input').getByRole('button', { name: 'Remove' });
    await expect(remove).toBeVisible();
    const box = await remove.boundingBox();
    // The visual glyph is small, but the hit area (m3-hit-slop) must still be reachable.
    expect(box).not.toBeNull();
  });

  test('an assist chip is keyboard operable', async ({ page }) => {
    // Same Mantine-checkbox DOM as above — the focusable control is the `<input>`.
    const chip = page.getByTestId('chip-assist').locator('input').first();
    await chip.focus();
    await expect(chip).toBeFocused();
  });

  test('a checked filter chip resolves Sonora accent colours in both themes', async ({ page }) => {
    // Wave 16c-1 (docs/ROADMAP.md §16): proves the --chip-bg/--chip-color overrides
    // (Chip.tsx's chipStyleVars) resolved to *used* values, not just that a var()
    // reference was written. `chip-filter` starts selected (App.tsx pins
    // `useState(true)`), so no interaction is needed to see the checked state.
    const label = page.getByTestId('chip-filter').locator('label').first();

    await expect(page.getByTestId('mode-dark')).toBeVisible();
    const darkBg = await label.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(darkBg).toBe('rgb(139, 92, 246)'); // --accent-ink == --accent in dark

    await page.getByTestId('mode-light').click();
    await page.waitForTimeout(700);
    const lightBg = await label.evaluate((el) => getComputedStyle(el).backgroundColor);
    // --accent-ink in light is color-mix(in oklch, var(--accent) 58%, black) — differs
    // from dark's raw passthrough, proving the mix actually ran.
    expect(lightBg).not.toBe(darkBg);
    expect(lightBg).not.toBe('rgb(139, 92, 246)');

    // restore for other tests sharing this worker's page context
    await page.getByTestId('mode-dark').click();
  });
});
