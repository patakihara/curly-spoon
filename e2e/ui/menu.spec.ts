/**
 * Wave 16c-4-W (docs/ROADMAP.md §16). `Menu` had no gallery coverage before this wave — its
 * only exercise anywhere in the suite was `e2e/app/context-menu.spec.ts`, which drives the
 * real app rather than the isolated `ui-desktop`/`ui-mobile` fixture. `MenuGallery` in
 * `packages/ui/gallery/App.tsx` gives it one, primarily so the re-parenting fix below has a
 * `getComputedStyle`-checkable instance here too, matching `dialog.spec.ts`/`sheet.spec.ts`.
 * A handful of basic behaviour assertions come along with it since none existed at this
 * level either.
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Menu', () => {
  test('opens via its keyboard-accessible trigger with real ARIA menu semantics', async ({
    page,
  }) => {
    const trigger = page.getByTestId('menu-open');
    await trigger.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', { name: 'Actions for Sample track' });
    await expect(menu).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Play next' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Play last' })).toBeVisible();
  });

  test('Escape closes it and returns focus to the trigger', async ({ page }) => {
    const trigger = page.getByTestId('menu-open');
    await trigger.click();
    await expect(page.getByRole('menu', { name: 'Actions for Sample track' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('closing the menu leaves nothing behind that intercepts clicks', async ({ page }) => {
    const trigger = page.getByTestId('menu-open');
    await trigger.click();
    await expect(page.getByRole('menu', { name: 'Actions for Sample track' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);

    // A real coordinate click, not the locator API's `.click()` — see `sheet.spec.ts`'s
    // identical check for why: `.click()` does its own actionability probing first, which
    // could silently route around a leftover overlay instead of proving one isn't there.
    const box = await trigger.boundingBox();
    if (!box) throw new Error('trigger not visible');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByRole('menu', { name: 'Actions for Sample track' })).toBeVisible();
  });

  // Wave 16c-4-W: the dropdown's portal moved from Mantine's default (`document.body`,
  // outside `.auralis-theme-root`) into `ThemeProvider`'s dedicated portal node, a child of
  // `.auralis-theme-root`, where `sonora-theme.css`'s `--surface-*` rules can actually match.
  // Every test above this one passes identically whether the dropdown paints with any colour
  // at all or not — only a `getComputedStyle` read distinguishes a correctly re-parented
  // dropdown from one still rendering unstyled at `document.body`. Both themes: the token is
  // theme-scoped with no `:root` fallback.
  for (const mode of ['dark', 'light'] as const) {
    test(`a Sonora surface token resolves on the dropdown in ${mode} mode`, async ({ page }) => {
      if (mode === 'light') {
        await page.getByTestId('mode-light').click();
      }
      await page.getByTestId('menu-open').click();
      const dropdown = page.locator('.m3-menu-dropdown');
      await expect(dropdown).toBeVisible();
      const surfaceCard = await dropdown.evaluate((el) =>
        getComputedStyle(el).getPropertyValue('--surface-card').trim(),
      );
      expect(surfaceCard).not.toBe('');
    });
  }
});
