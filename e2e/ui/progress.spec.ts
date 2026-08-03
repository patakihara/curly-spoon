import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('LinearProgress', () => {
  test('determinate reports its value via aria-valuenow', async ({ page }) => {
    const bar = page.getByTestId('linear-progress-determinate').locator('[role="progressbar"]');
    await expect(bar).toHaveAttribute('aria-valuenow', '60');
  });

  test('indeterminate omits aria-valuenow and animates', async ({ page }) => {
    // Mantine's `Progress.Root`/`Progress.Section` split: `role="progressbar"` lives on
    // the *root* in indeterminate mode (LinearProgress.tsx sets `withAria={false}` on the
    // section so it never claims a fake numeric value), and the striped/animated fill is
    // a separate child carrying Mantine's static class `mantine-Progress-section` plus
    // `data-animated` — the old hand-rolled `.m3-linear-progress__indeterminate` class is
    // gone. The animation itself lives directly on that element (not a pseudo-element).
    const bar = page.getByTestId('linear-progress-indeterminate').locator('[role="progressbar"]');
    await expect(bar).not.toHaveAttribute('aria-valuenow');
    const fill = bar.locator('.mantine-Progress-section');
    await expect(fill).toHaveAttribute('data-animated', 'true');
    const animationName = await fill.evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).not.toBe('none');
  });

  // Mantine has no wavy-stroke primitive (see LinearProgress.tsx's doc comment): `wavy`
  // now only renders a thicker bar with the same striped/animated fill as the plain
  // indeterminate bar, rather than a distinct wave background image. This is a real,
  // intentional behavior change from the pre-Mantine component, not a stale locator —
  // confirmed directly against the rendered DOM, both bars share identical
  // `data-striped`/`data-animated` styling and differ only in `--progress-size`.
  test('wavy indeterminate renders as a thicker bar than the plain indeterminate one', async ({
    page,
  }) => {
    const wavyBar = page.getByTestId('linear-progress-wavy').locator('[role="progressbar"]');
    const plainBar = page
      .getByTestId('linear-progress-indeterminate')
      .locator('[role="progressbar"]');
    const wavyBox = await wavyBar.boundingBox();
    const plainBox = await plainBar.boundingBox();
    expect(wavyBox).not.toBeNull();
    expect(plainBox).not.toBeNull();
    expect(wavyBox!.height).toBeGreaterThan(plainBox!.height);
  });
});

test.describe('CircularProgress', () => {
  test('determinate reports its value', async ({ page }) => {
    const ring = page.getByTestId('circular-progress-determinate').locator('[role="progressbar"]');
    await expect(ring).toHaveAttribute('aria-valuenow', '40');
  });

  test('indeterminate spins continuously', async ({ page }) => {
    // CircularProgress.tsx: indeterminate mode is Mantine's `Loader` (`type="oval"`), a
    // single `<span role="progressbar">` whose spin animation is applied to its `::after`
    // pseudo-element (the visible ring), not the element itself — `getComputedStyle` needs
    // the pseudo-element argument or `animationName` reads as the default 'none'.
    const ring = page
      .getByTestId('circular-progress-indeterminate')
      .locator('[role="progressbar"]');
    await expect(ring).not.toHaveAttribute('aria-valuenow');
    const animationName = await ring.evaluate(
      (el) => getComputedStyle(el, '::after').animationName,
    );
    expect(animationName).not.toBe('none');
  });
});
