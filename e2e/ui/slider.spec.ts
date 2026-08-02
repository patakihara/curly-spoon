import { expect, test } from '@playwright/test';

/**
 * The YouTube Music progress bar — the component docs/DESIGN.md calls out as
 * mattering most. Real pointer drag, not just a synthetic value change.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Slider', () => {
  test('exposes role=slider with correct aria-value*', async ({ page }) => {
    const slider = page.locator('[data-testid="slider-basic"] [role="slider"]');
    await expect(slider).toHaveAttribute('aria-valuemin', '0');
    await expect(slider).toHaveAttribute('aria-valuemax', '100');
    await expect(slider).toHaveAttribute('aria-valuenow', '30');
    await expect(slider).toHaveAccessibleName('Playback position');
  });

  test('is keyboard steppable with arrow keys, Home and End', async ({ page }) => {
    const slider = page.locator('[data-testid="slider-basic"] [role="slider"]');
    await slider.focus();

    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuenow', '31');

    await page.keyboard.press('ArrowLeft');
    await expect(slider).toHaveAttribute('aria-valuenow', '30');

    await page.keyboard.press('End');
    await expect(slider).toHaveAttribute('aria-valuenow', '100');

    await page.keyboard.press('Home');
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
  });

  test('dragging the track with the pointer changes the value', async ({ page }) => {
    const slider = page.locator('[data-testid="slider-basic"] [role="slider"]');
    // Raw page.mouse coordinates don't auto-scroll like locator actions do.
    await slider.scrollIntoViewIfNeeded();
    const box = await slider.boundingBox();
    if (!box) throw new Error('slider not visible');

    const before = await slider.getAttribute('aria-valuenow');

    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();

    const after = await slider.getAttribute('aria-valuenow');
    expect(after).not.toBe(before);
    expect(Number(after)).toBeGreaterThan(Number(before));
  });

  test('the track thickens while dragging and settles back on release', async ({ page }) => {
    const wrapper = page.locator('[data-testid="slider-basic"] .m3-slider');
    const track = page.locator('[data-testid="slider-basic"] .m3-slider__track');
    await track.scrollIntoViewIfNeeded();
    const box = await track.boundingBox();
    if (!box) throw new Error('slider not visible');

    const restHeight = await track.evaluate((el) => getComputedStyle(el).height);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(50);
    await expect(wrapper).toHaveClass(/m3-slider--dragging/);
    const draggingHeight = await track.evaluate((el) => getComputedStyle(el).height);
    expect(Number.parseFloat(draggingHeight)).toBeGreaterThan(Number.parseFloat(restHeight));

    await page.mouse.up();
    await expect(wrapper).not.toHaveClass(/m3-slider--dragging/);
  });

  test('shows a buffered range underlay distinct from the active track', async ({ page }) => {
    const buffered = page.locator('[data-testid="slider-buffered"] .m3-slider__buffered');
    const active = page.locator('[data-testid="slider-buffered"] .m3-slider__active');
    await expect(buffered).toBeVisible();
    const bufferedWidth = await buffered.evaluate((el) => el.getBoundingClientRect().width);
    const activeWidth = await active.evaluate((el) => el.getBoundingClientRect().width);
    expect(bufferedWidth).toBeGreaterThan(activeWidth);
  });

  test('a disabled slider is not focusable via tab order', async ({ page }) => {
    const slider = page.locator('[data-testid="slider-disabled"] [role="slider"]');
    await expect(slider).toHaveAttribute('aria-disabled', 'true');
    await expect(slider).toHaveAttribute('tabindex', '-1');
  });

  test('the wavy track only animates while the wave is set to animate', async ({ page }) => {
    const animatingActive = page.locator('[data-testid="slider-wavy"] .m3-slider__active');
    const animationName = await animatingActive.evaluate(
      (el) => getComputedStyle(el).animationName,
    );
    expect(animationName).not.toBe('none');

    const staticActive = page.locator('[data-testid="slider-basic"] .m3-slider__active');
    const staticAnimationName = await staticActive.evaluate(
      (el) => getComputedStyle(el).animationName,
    );
    expect(staticAnimationName).toBe('none');
  });
});
