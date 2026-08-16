import { expect, test } from '@playwright/test';

/**
 * Wave 16b-1: Inter and Roboto Flex are self-hosted, not loaded from Google's CDN. This
 * product is one container on one port, designed to run offline or LAN-only (see
 * docs/HANDOVER.md §16) — a CDN `@font-face` would degrade every glyph to a system fallback
 * the moment the network path to Google is unavailable.
 *
 * Per docs/HANDOVER.md's own warning, a green local Playwright run is not by itself strong
 * evidence about a CSS-delivery change (a bundling change once passed 188/188 locally and
 * still regressed CI twice on a layout-stability assertion). The network-request assertion
 * below is the one that actually pins the property this wave exists to guarantee, and it is
 * a functional assertion (zero requests to a third-party host), not a timing/layout one —
 * it does not share that failure class.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Self-hosted fonts', () => {
  test('makes no request to fonts.googleapis.com or fonts.gstatic.com', async ({ page }) => {
    const thirdPartyFontRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
        thirdPartyFontRequests.push(url);
      }
    });

    // Re-navigate under the listener (the beforeEach navigation happened before it attached)
    // and wait for the fonts to actually settle, so a CDN request racing in after first paint
    // is still caught. Force both faces to load — nothing in the gallery renders text with
    // `var(--font-display)` yet, so a Roboto Flex regression would otherwise never be
    // exercised at all, CDN or not.
    await page.goto('/');
    await page.evaluate(() =>
      Promise.all([
        document.fonts.ready,
        document.fonts.load('16px Inter'),
        document.fonts.load('900 16px "Roboto Flex"'),
      ]),
    );

    expect(thirdPartyFontRequests).toEqual([]);
  });

  test('Inter loads and applies as the body font', async ({ page }) => {
    await page.evaluate(() => document.fonts.ready);

    const interLoaded = await page.evaluate(() => document.fonts.check('16px Inter'));
    expect(interLoaded).toBe(true);

    // Checking `fontFamily` alone would pass even if the font never loaded (the string is set
    // regardless) — pair it with the `document.fonts.check` assertion above, which only
    // reports true once the browser has actually resolved and loaded the face.
    const bodyFontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(bodyFontFamily).toContain('Inter');
  });

  test('Roboto Flex loads as a variable font spanning the full weight range', async ({ page }) => {
    await page.evaluate(() => document.fonts.ready);

    // Nothing in the gallery renders text with `var(--font-display)` yet (that wiring is a
    // later wave), so the browser would never lazily fetch this face on its own —
    // `document.fonts.check` alone would report false regardless of whether the `@font-face`
    // is correct. `document.fonts.load` force-fetches the matching face, which is the
    // assertion this test actually wants: that the declared `@font-face` resolves and the
    // vendored file is reachable at all, ahead of the wave that wires up a consumer.
    //
    // `document.fonts.check` with a single weight only proves that weight resolves; check
    // both ends of the declared `400 900` range so a `font-weight: 400;` (single-value)
    // regression — which would silently render every heavier weight at 400 — is caught.
    await page.evaluate(() =>
      Promise.all([
        document.fonts.load('400 16px "Roboto Flex"'),
        document.fonts.load('900 16px "Roboto Flex"'),
      ]),
    );

    const lightLoaded = await page.evaluate(() => document.fonts.check('400 16px "Roboto Flex"'));
    const heavyLoaded = await page.evaluate(() => document.fonts.check('900 16px "Roboto Flex"'));
    expect(lightLoaded).toBe(true);
    expect(heavyLoaded).toBe(true);
  });
});
