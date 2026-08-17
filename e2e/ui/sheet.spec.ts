import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Sheet', () => {
  test('opens as a modal dialog with a scrim, and traps focus', async ({ page }) => {
    await page.getByTestId('sheet-open').click();
    const panel = page.getByRole('dialog', { name: 'Queue' });
    await expect(panel).toBeVisible();
    await expect(page.locator('.m3-sheet-scrim')).toBeVisible();
    // Focus should have moved into the sheet, not stayed on the trigger button.
    await expect(page.getByTestId('sheet-open')).not.toBeFocused();
  });

  test('Escape closes it and returns focus to the trigger', async ({ page }) => {
    const trigger = page.getByTestId('sheet-open');
    await trigger.click();
    await expect(page.getByRole('dialog', { name: 'Queue' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Queue' })).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('clicking the scrim closes it', async ({ page }) => {
    await page.getByTestId('sheet-open').click();
    await page.locator('.m3-sheet-scrim').click({ position: { x: 5, y: 5 } });
    await expect(page.getByRole('dialog', { name: 'Queue' })).toHaveCount(0);
  });

  test('dragging the handle down past the dismiss threshold closes the sheet', async ({ page }) => {
    await page.getByTestId('sheet-open').click();
    const panel = page.getByRole('dialog', { name: 'Queue' });
    // Wait for the spring entrance animation to settle — the panel starts translated
    // fully off-screen, and a mid-animation boundingBox() would give bogus coordinates.
    await expect(panel).toHaveCSS('transform', 'none');
    const handle = page.locator('.m3-sheet-handle-area');
    const box = await handle.boundingBox();
    if (!box) throw new Error('handle not visible');

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Drag most of the way down the viewport — well past the dismiss threshold.
    const viewport = page.viewportSize()!;
    await page.mouse.move(startX, viewport.height - 10, { steps: 10 });
    await page.mouse.up();

    await expect(page.getByRole('dialog', { name: 'Queue' })).toHaveCount(0);
  });

  test('dragging the handle up a little snaps to the taller detent instead of dismissing', async ({
    page,
  }) => {
    await page.getByTestId('sheet-open').click();
    const panel = page.getByRole('dialog', { name: 'Queue' });
    await expect(panel).toHaveCSS('transform', 'none');
    const heightBefore = (await panel.boundingBox())!.height;

    const handle = page.locator('.m3-sheet-handle-area');
    const box = await handle.boundingBox();
    if (!box) throw new Error('handle not visible');
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY - 200, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    const heightAfter = (await panel.boundingBox())!.height;
    expect(heightAfter).toBeGreaterThan(heightBefore);
  });

  test('Tab cycles focus within the sheet rather than escaping to the page', async ({ page }) => {
    await page.getByTestId('sheet-open').click();
    const closeButton = page.getByTestId('sheet-close');
    await closeButton.focus();
    await page.keyboard.press('Tab');
    // With only one focusable descendant, Tab should wrap back to it, not to page chrome.
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect(focused).toBe('sheet-close');
  });

  // Same bug class the Mantine migration found and fixed in Dialog.tsx: `unstyled`
  // on Modal stripped the default CSS that hides its always-mounted root while
  // closed, leaving a permanent full-viewport click-blocker. `Sheet.tsx` uses a
  // different Mantine primitive (`Drawer`, not `Modal`) and does not set
  // `unstyled`, but that's "doesn't set the known trigger", not "verified
  // absent" — Drawer's root wrapper (`Drawer.Root` → `ModalBase`'s outer `Box`)
  // is unconditionally rendered by Mantine regardless of `opened`, so proving
  // nothing is left behind needs an empirical check, not a grep.
  test('closing the sheet leaves nothing behind that intercepts clicks', async ({ page }) => {
    const trigger = page.getByTestId('sheet-open');
    const dialog = page.getByRole('dialog', { name: 'Queue' });

    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // 1. A real coordinate click, not the locator API's own `.click()` — that
    // does its own actionability/interception checks first, which could
    // silently route around exactly the leftover-overlay bug this is checking
    // for. `page.mouse.click` has no such fallback: if something is on top of
    // the trigger, the click lands on that something instead, and the sheet
    // would never reopen.
    const box = await trigger.boundingBox();
    if (!box) throw new Error('trigger not visible');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(dialog).toBeVisible();

    // Back to closed for the second check.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // 2. Direct `elementFromPoint` sweep. Mantine's `useStyles({ name: 'Drawer',
    // ... })` (packages/@mantine/core's use-styles.ts) generates static classes
    // as `mantine-${themeName}-${selector}` for every Drawer slot — root,
    // overlay, content, inner, body — i.e. every one is `mantine-Drawer-*`
    // (the same prefix `Sheet.css`'s header comment already relies on for
    // `.mantine-Drawer-content`/`.mantine-Drawer-inner`). None of the sampled
    // points should resolve to a node carrying that prefix once the sheet is
    // closed.
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('no viewport');
    const points: Array<[number, number]> = [
      [viewport.width / 2, viewport.height / 2],
      [viewport.width * 0.1, viewport.height * 0.1],
      [viewport.width * 0.9, viewport.height * 0.1],
      [viewport.width * 0.1, viewport.height * 0.9],
      [viewport.width * 0.9, viewport.height * 0.9],
    ];
    const leftovers = await page.evaluate(
      (pts) =>
        pts
          .map(([x, y]) => {
            const el = document.elementFromPoint(x, y);
            const drawerNode = el?.closest('[class*="mantine-Drawer-"]');
            return drawerNode ? drawerNode.className : null;
          })
          .filter((v): v is string => v !== null),
      points,
    );
    expect(leftovers).toEqual([]);
  });

  // Wave 16c-4-W (docs/ROADMAP.md §16) — same reasoning as `dialog.spec.ts`'s identical
  // block: `Drawer.Root`'s portal moved from `document.body` into `ThemeProvider`'s
  // dedicated portal node, a child of `.auralis-theme-root`, where `sonora-theme.css`'s
  // `--surface-*` rules can actually match. Nothing above this test can distinguish a
  // correctly re-parented panel from one still rendering unstyled at `document.body` —
  // both pass identically on testids and text. Both themes: the token is theme-scoped with
  // no `:root` fallback.
  for (const mode of ['dark', 'light'] as const) {
    test(`a Sonora surface token resolves on the sheet panel in ${mode} mode`, async ({ page }) => {
      if (mode === 'light') {
        await page.getByTestId('mode-light').click();
      }
      await page.getByTestId('sheet-open').click();
      // `.m3-sheet-panel` alone is ambiguous — `Sheet.css`'s own header comment explains why:
      // Mantine's `Drawer.Content` applies the className to *two* DOM nodes, the fixed
      // positioning wrapper (`.mantine-Drawer-inner`) and the visible panel
      // (`.mantine-Drawer-content`, `role="dialog"`). The role locator picks the latter.
      const panel = page.getByRole('dialog', { name: 'Queue' });
      await expect(panel).toBeVisible();
      const surfaceCard = await panel.evaluate((el) =>
        getComputedStyle(el).getPropertyValue('--surface-card').trim(),
      );
      expect(surfaceCard).not.toBe('');

      const scrim = page.locator('.m3-sheet-scrim');
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
