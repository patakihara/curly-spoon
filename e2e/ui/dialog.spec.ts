import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Dialog', () => {
  test('opens as a modal with a spring entrance and traps focus', async ({ page }) => {
    const trigger = page.getByTestId('dialog-open');
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Remove download?' });
    await expect(dialog).toBeVisible();
    await expect(trigger).not.toBeFocused();

    const animationName = await dialog.evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).not.toBe('none');
  });

  test('Escape closes it and restores focus to the trigger', async ({ page }) => {
    const trigger = page.getByTestId('dialog-open');
    await trigger.click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('Tab cycles between Cancel and Remove without escaping the dialog', async ({ page }) => {
    await page.getByTestId('dialog-open').click();
    const cancel = page.getByTestId('dialog-cancel');
    const confirm = page.getByTestId('dialog-confirm');

    await confirm.focus();
    await page.keyboard.press('Tab');
    await expect(cancel).toBeFocused();
  });

  test('clicking a scrim dismisses it', async ({ page }) => {
    await page.getByTestId('dialog-open').click();
    await page.locator('.m3-dialog-scrim').click({ position: { x: 5, y: 5 } });
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('the Remove action closes the dialog', async ({ page }) => {
    await page.getByTestId('dialog-open').click();
    await page.getByTestId('dialog-confirm').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  // Wave 16c-4-W (docs/ROADMAP.md §16): `Modal`'s portal moved from Mantine's default
  // (`document.body`, outside `.auralis-theme-root`) to `ThemeProvider`'s dedicated portal
  // node, a child of `.auralis-theme-root`. Playwright asserts testids and text — every test
  // above this one passes whether or not the panel is painted with any colour at all, which
  // is exactly the failure mode 14a-2 already documented (component renders, unstyled). Only
  // a `getComputedStyle` read proves the re-parenting actually worked: before the fix, this
  // read a non-empty string here too (`sonora-theme.css`'s `.auralis-theme-root[data-theme]`
  // rule never matched a `document.body`-portalled panel, so the property fell through to
  // nothing and `getPropertyValue` returns `''`, not an error). Checked in both themes since
  // `--surface-card` is theme-scoped with no `:root` fallback — a value missing in only one
  // theme would pass a single-theme check.
  for (const mode of ['dark', 'light'] as const) {
    test(`a Sonora surface token resolves on the dialog panel in ${mode} mode`, async ({
      page,
    }) => {
      if (mode === 'light') {
        await page.getByTestId('mode-light').click();
      }
      await page.getByTestId('dialog-open').click();
      const panel = page.locator('.m3-dialog-panel');
      await expect(panel).toBeVisible();
      const surfaceCard = await panel.evaluate((el) =>
        getComputedStyle(el).getPropertyValue('--surface-card').trim(),
      );
      expect(surfaceCard).not.toBe('');

      // The scrim still covers the full viewport — re-parenting the portal must not have
      // changed its positioning context (a `transform`/`filter` ancestor would break a
      // `position: fixed` child's containing block; `.auralis-theme-root` and the new
      // `display: contents` portal target have neither).
      const scrim = page.locator('.m3-dialog-scrim');
      const scrimBox = await scrim.boundingBox();
      const viewport = page.viewportSize();
      expect(scrimBox).not.toBeNull();
      expect(viewport).not.toBeNull();
      if (scrimBox && viewport) {
        expect(scrimBox.width).toBeGreaterThanOrEqual(viewport.width - 1);
        expect(scrimBox.height).toBeGreaterThanOrEqual(viewport.height - 1);
      }
    });
  }
});
