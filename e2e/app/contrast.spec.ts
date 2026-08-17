/**
 * Colour contrast on the real, rendered app — not the design-system tokens in
 * isolation. `packages/ui/src/tokens/color.test.ts` already asserts every
 * generated `on*`/container pair clears WCAG AA at the *token* level, in both
 * light and dark; this file checks whether that guarantee survives once real
 * components compose those tokens onto real surfaces (docs/HANDOVER.md's
 * phase-10 audit item: "check whether that guarantee actually survives into
 * the rendered app").
 *
 * The contrast-ratio formula below is written independently of
 * `packages/ui/src/tokens/color.ts`'s own `contrastRatio` — reusing the same
 * implementation the unit tests already trust would only prove the two agree
 * with each other, not that either is correct. Both implement the same public
 * WCAG 2 formula (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance), so
 * agreement between them is a real (if weak) cross-check, not a tautology.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Signed in already, via the `app` project's `storageState`.
  await page.goto('/');
  await expect(page.getByTestId('home-page')).toBeVisible();
});

type Rgb = { r: number; g: number; b: number };

/** WCAG relative luminance of a single sRGB channel (0-255). */
function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of an sRGB colour. */
function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** WCAG 2 contrast ratio between two sRGB colours, from 1 (no contrast) to 21. */
function contrastRatio(a: Rgb, b: Rgb): number {
  const lumA = relativeLuminance(a);
  const lumB = relativeLuminance(b);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Parses a `getComputedStyle` `rgb()`/`rgba()` string. */
function parseRgb(value: string): Rgb {
  const match = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(value);
  if (!match) throw new Error(`Unparseable colour: ${value}`);
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

/**
 * Walks up from the element carrying `testId` past any transparent ancestor
 * to find the colour a viewer would actually see painted behind its text —
 * most of this app's surfaces set `background-color` only on a containing
 * card/page element, not on the text node itself.
 */
async function effectiveBackground(locator: Locator): Promise<Rgb> {
  const color = await locator.evaluate((start) => {
    let el: Element | null = start;
    while (el) {
      const bg = getComputedStyle(el).backgroundColor;
      const match = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(bg);
      if (match && (match[4] === undefined || Number(match[4]) > 0)) return bg;
      el = el.parentElement;
    }
    return 'rgb(255, 255, 255)';
  });
  return parseRgb(color);
}

/**
 * The first shelf card, as a `Locator` — some fixture items (e.g. a
 * continue-listening book that's also recently added) appear on more than one
 * shelf and therefore share a `data-testid`, so every lookup here goes
 * through a single already-`.first()`-scoped locator rather than a bare
 * `getByTestId`/`data-testid` string re-query, which would hit Playwright's
 * strict-mode "resolved to N elements" error on those duplicates.
 */
function firstShelfItem(page: Page): Locator {
  return page.locator('[data-testid^="shelf-item-"]').first();
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.reload();
      await expect(page.getByTestId('home-page')).toBeVisible();
    });

    test('a shelf card title clears WCAG AA (4.5:1) against its surface', async ({ page }) => {
      const card = firstShelfItem(page);
      await expect(card).toBeVisible();
      const title = card.locator('h3');
      const fgValue = await title.evaluate((el) => getComputedStyle(el).color);
      const bg = await effectiveBackground(card);
      expect(contrastRatio(parseRgb(fgValue), bg)).toBeGreaterThanOrEqual(4.5);
    });

    test('a shelf card author (on-surface-variant, the muted secondary tone) clears WCAG AA', async ({
      page,
    }) => {
      // Wave 16c-2-W-2: this used to scope to `firstShelfItem()` and
      // `test.skip(!hasAuthor, …)` past it — which silently stopped this check from
      // running whenever the *first* shelf card happened to have no subtitle line.
      // That happened mid-session (docs/HANDOVER.md: 189/1 -> 188/2 skipped, no
      // failure, on the exact wave that redefined the token this test exists to
      // pin) and closed again on its own once card layout changed elsewhere.
      // Carousel.tsx now renders `<p>{item.subtitle ?? ' '}</p>` unconditionally
      // (a layout-stability fix, not a contrast-guard one) — element *presence*
      // alone is therefore no longer proof of a real author line, since a blank
      // placeholder `' '` would satisfy it just as well as genuine text. Scan every
      // rendered shelf card for one whose subtitle has real (non-whitespace)
      // content, and fail — never skip — if none of them do: a guard that can
      // vanish without moving the pass/fail count is worse than one that goes red.
      const candidates = page.locator(
        '[data-testid^="shelf-item-"]:not([data-testid*="skeleton"]):not([data-testid$="-external-badge"])',
      );
      // Shelves render a skeleton first and swap in real cards once their query
      // resolves (excluded above by testid) — wait for at least one real card
      // before counting, the same wait `firstShelfItem()` + `toBeVisible()` already
      // gave the sibling title/heading tests, or this reads an in-flight loading
      // state as "no card has an author" and fails for the wrong reason.
      await expect(candidates.first()).toBeVisible();
      const candidateCount = await candidates.count();
      let card: Locator | null = null;
      for (let i = 0; i < candidateCount; i++) {
        const item = candidates.nth(i);
        const text = (await item.locator('p').first().textContent())?.trim();
        if (text) {
          card = item;
          break;
        }
      }
      expect(
        card,
        'No shelf card on Home renders a non-empty author/subtitle line — the fixture ' +
          'or card markup changed; point this test at a card that still has one rather ' +
          'than letting it skip.',
      ).not.toBeNull();
      const author = card!.locator('p').first();
      const fgValue = await author.evaluate((el) => getComputedStyle(el).color);
      const bg = await effectiveBackground(card!);
      expect(contrastRatio(parseRgb(fgValue), bg)).toBeGreaterThanOrEqual(4.5);
    });

    test('the page heading clears WCAG AA against the page background', async ({ page }) => {
      const heading = page.locator('[data-testid="home-page"] h1').first();
      const fgValue = await heading.evaluate((el) => getComputedStyle(el).color);
      const bg = await effectiveBackground(page.getByTestId('home-page'));
      expect(contrastRatio(parseRgb(fgValue), bg)).toBeGreaterThanOrEqual(4.5);
    });
  });
}
