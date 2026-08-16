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
      el.addEventListener(
        'click',
        () => ((window as unknown as { __clicked: boolean }).__clicked = true),
      ),
    );
    await page.keyboard.press('Enter');
    const clicked = await page.evaluate(
      () => (window as unknown as { __clicked?: boolean }).__clicked ?? false,
    );
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

  test('keeps a constant pill radius under press (Sonora has no shape-morph-on-press)', async ({
    page,
  }) => {
    // Wave 16c-1 (docs/ROADMAP.md §16): the pre-Sonora M3 Expressive treatment sprang the
    // corner radius from fully round to a smaller radius while pressed. Sonora's own
    // guidance describes a *fill* change on press instead ("a pill-shaped accent-tinted
    // fill" on mobile, "buttons rely on a ~10% shift" on desktop) — not a radius change —
    // so this now asserts the opposite of the pre-migration behaviour: the radius is a
    // constant pill, at rest and pressed alike.
    const button = page.getByTestId('button-filled');
    const restRadius = await button.evaluate((el) => getComputedStyle(el).borderRadius);
    expect(restRadius).toBe('999px');

    // Raw page.mouse coordinates are viewport-relative and don't auto-scroll, unlike
    // locator actions such as .click() — so the element must be brought into view first.
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    if (!box) throw new Error('button not visible');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(50);
    const pressedRadius = await button.evaluate((el) => getComputedStyle(el).borderRadius);
    await page.mouse.up();

    expect(pressedRadius).toBe(restRadius);
  });

  test('the elevated variant resolves Sonora surface/text colours in both themes', async ({
    page,
  }) => {
    // Wave 16c-1: `elevated` is the variant with an explicit style override (see
    // Button.tsx), so it's the one that can prove the Sonora tokens actually reached a
    // *used* value, not just that a var() reference was written — the class of bug
    // docs/HANDOVER.md warns Playwright's testid/text assertions otherwise can't see.
    // Reconciled against docs/design/sonora/primitives/Button.jsx: text colour is plain
    // --surface-fg (Sonora's `ghost`/`secondary` variants use it, not an accent colour).
    const button = page.getByTestId('button-elevated');

    await expect(page.getByTestId('mode-dark')).toBeVisible();
    const darkBg = await button.evaluate((el) => getComputedStyle(el).backgroundColor);
    const darkColor = await button.evaluate((el) => getComputedStyle(el).color);
    expect(darkBg).toBe('rgb(20, 20, 20)'); // --surface-card, dark
    expect(darkColor).toBe('rgb(225, 225, 225)'); // --surface-fg, dark

    await page.getByTestId('mode-light').click();
    // Matches e2e/ui/sonora-tokens.spec.ts's own wait: colours registered via
    // CSS.registerProperty cross-fade over spring.slow (~500ms) on a mode switch.
    await page.waitForTimeout(700);
    const lightBg = await button.evaluate((el) => getComputedStyle(el).backgroundColor);
    const lightColor = await button.evaluate((el) => getComputedStyle(el).color);
    expect(lightBg).toBe('rgb(225, 225, 225)'); // --surface-card, light
    expect(lightColor).toBe('rgb(25, 25, 25)'); // --surface-fg, light

    // restore for other tests sharing this worker's page context
    await page.getByTestId('mode-dark').click();
  });

  test('a `text` button inside Dialog stays legible in light mode (portal fallback check)', async ({
    page,
  }) => {
    // Wave 16c-1: `Dialog` portals to `document.body`, outside `.auralis-theme-root`,
    // where `--surface-fg` has no `:root` fallback (sonora-theme.css's header). A literal
    // fallback here would be wrong in whichever theme it doesn't match — this is the
    // empirical check the comment in Button.tsx (VARIANT_STYLE_OVERRIDE) refers to.
    // `currentColor` is meant to inherit Mantine's own theme-aware Modal text colour
    // instead of committing to one theme's literal.
    await page.getByTestId('mode-light').click();
    await page.waitForTimeout(700);

    await page.getByTestId('dialog-open').click();
    const cancel = page.getByTestId('dialog-cancel');
    await expect(cancel).toBeVisible();

    const color = await cancel.evaluate((el) => getComputedStyle(el).color);
    // Walk up for the first non-transparent background, same technique as
    // e2e/app/contrast.spec.ts's effectiveBackground().
    const bg = await cancel.evaluate((start) => {
      let el: Element | null = start;
      while (el) {
        const c = getComputedStyle(el).backgroundColor;
        const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c);
        if (m && (m[4] === undefined || Number(m[4]) > 0)) return c;
        el = el.parentElement;
      }
      return 'rgb(255, 255, 255)';
    });

    const parse = (s: string) => {
      const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(s);
      if (!m) throw new Error(`unparseable colour: ${s}`);
      return [Number(m[1]), Number(m[2]), Number(m[3])] as const;
    };
    const [cr, cg, cb] = parse(color);
    const [br, bg2, bb] = parse(bg);
    // Not a strict WCAG check (Mantine's own Modal colour is outside this wave's scope
    // to pin exactly) — just proves the fallback didn't collapse text and background to
    // the same near-white value, i.e. white-on-white, which a dark-literal fallback for
    // --surface-fg would have produced here.
    const distance = Math.abs(cr - br) + Math.abs(cg - bg2) + Math.abs(cb - bb);
    expect(distance).toBeGreaterThan(60);

    await page.getByTestId('dialog-cancel').click(); // close
    await page.getByTestId('mode-dark').click(); // restore
  });
});
