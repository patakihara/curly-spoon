import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

/**
 * `getComputedStyle().animationDuration` serialises as `"0.01ms"` or `"1e-05s"`
 * depending on engine, both meaning the same real duration — parse rather than
 * string-match so this doesn't pin one browser's formatting choice.
 */
function parseCssMs(value: string): number {
  const trimmed = value.trim();
  const num = parseFloat(trimmed);
  return trimmed.endsWith('ms') ? num : num * 1000;
}

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

  test('honours prefers-reduced-motion: the scrolling stripe animation does not run', async ({
    page,
  }) => {
    // Verified empirically, not assumed: `packages/ui/src/styles/index.css`'s global
    // `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { ... !important } }`
    // rule forces `animation-duration`/`animation-iteration-count` to near-zero/one on
    // *every* element, `!important` — so it wins over Mantine's own (non-`!important`)
    // `[data-animated]` rule regardless of import order or specificity, with no
    // per-component wiring needed. `animation-name` stays non-'none' (only duration/
    // iteration-count are touched, unlike Skeleton.tsx's explicit `animate={false}`
    // fix), so the correct check is computed *duration* collapsing to near-zero, which
    // is what actually stops the continuous scroll a user would perceive as motion.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    const bar = page.getByTestId('linear-progress-indeterminate').locator('[role="progressbar"]');
    const fill = bar.locator('.mantine-Progress-section');
    const duration = await fill.evaluate((el) => getComputedStyle(el).animationDuration);
    expect(parseCssMs(duration)).toBeLessThan(1);
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

  test('honours prefers-reduced-motion: the spin does not run', async ({ page }) => {
    // Same global catch-all as LinearProgress's equivalent test above — the spin's
    // `animation-name` stays set (it lives on Mantine's own compiled class, which
    // this package cannot rename), but `animation-duration` collapses to
    // near-instant and `animation-iteration-count` to 1, so it no longer spins
    // continuously.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    const ring = page
      .getByTestId('circular-progress-indeterminate')
      .locator('[role="progressbar"]');
    const duration = await ring.evaluate((el) => getComputedStyle(el, '::after').animationDuration);
    expect(parseCssMs(duration)).toBeLessThan(1);
  });
});
