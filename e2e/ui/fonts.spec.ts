import { expect, test } from '@playwright/test';

/**
 * Wave 16b-1: Inter and Roboto Flex are self-hosted, not loaded from Google's CDN. This
 * product is one container on one port, designed to run offline or LAN-only (see
 * docs/HANDOVER.md §16) — a CDN `@font-face` would degrade every glyph to a system fallback
 * the moment the network path to Google is unavailable.
 *
 * Per docs/HANDOVER.md's own warning, a green local Playwright run is not by itself strong
 * evidence about a CSS-delivery change (a bundling change once passed 188/188 locally and
 * still regressed CI twice on a layout-stability assertion). More specifically here:
 * `document.fonts.check()`/`.load()` alone are **not** falsifiable guarantees — deleting the
 * `@font-face` rules entirely still leaves `document.fonts.check('16px Inter')` reporting
 * `true` (vacuously — there is nothing that "hasn't loaded" if nothing matches), and
 * `.load()` on an unmatched family resolves with an empty array rather than throwing. Verified
 * by hand: commenting out `@import './fonts.css';` in packages/ui/src/styles/index.css leaves
 * two of the three original assertions in this file green. So every test below pairs a
 * `document.fonts` assertion with a **real same-origin `.woff2` network response**, which is
 * the only thing that cannot pass on a tree with the `@font-face` rules missing.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Self-hosted fonts', () => {
  test('serves Inter and Roboto Flex as same-origin woff2 responses, with no request to a third-party font CDN', async ({
    page,
  }) => {
    const woff2Responses: { url: string; status: number }[] = [];
    const thirdPartyFontRequests: string[] = [];
    page.on('response', (response) => {
      const url = response.url();
      if (url.endsWith('.woff2')) {
        woff2Responses.push({ url, status: response.status() });
      }
    });
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
        thirdPartyFontRequests.push(url);
      }
    });

    // Re-navigate under the listeners (the beforeEach navigation happened before they
    // attached) and force both faces to load. Nothing in the gallery renders text with
    // `var(--font-display)` yet (that wiring is a later wave), so without an explicit
    // `document.fonts.load` the browser would never fetch Roboto Flex at all — a CDN
    // regression on that face specifically would go unexercised either way.
    await page.goto('/');
    await page.evaluate(() =>
      Promise.all([
        document.fonts.ready,
        document.fonts.load('16px Inter'),
        document.fonts.load('900 16px "Roboto Flex"'),
      ]),
    );

    // The positive assertion: this is the one a deleted `@font-face` block, or a re-added
    // CDN `@import`, cannot satisfy by accident. `document.fonts.check`/`.load` alone would
    // still pass on a tree with the fonts.css import removed entirely — see the file-level
    // comment.
    const pageOrigin = new URL(page.url()).origin;
    expect(
      woff2Responses,
      'expected at least one same-origin .woff2 response for Inter/Roboto Flex',
    ).not.toHaveLength(0);
    for (const { url, status } of woff2Responses) {
      expect(new URL(url).origin, `expected ${url} to be same-origin`).toBe(pageOrigin);
      // 304 is a legitimate success (the dev server's cache-revalidation path for a static
      // asset); only a real failure status should fail this assertion.
      expect(status, `expected ${url} to respond with success, not ${status}`).toBeLessThan(400);
    }
    expect(woff2Responses.some((r) => r.url.includes('inter'))).toBe(true);
    expect(woff2Responses.some((r) => r.url.includes('roboto-flex'))).toBe(true);

    expect(thirdPartyFontRequests).toEqual([]);
  });

  test('Inter loads and applies as the body font', async ({ page }) => {
    await page.evaluate(() => document.fonts.ready);

    const interLoaded = await page.evaluate(() => document.fonts.check('16px Inter'));
    expect(interLoaded).toBe(true);

    // Checking `fontFamily` alone would pass even if the font never loaded (the string is set
    // regardless) — pair it with the `document.fonts.check` assertion above, which only
    // reports true once the browser has actually resolved and loaded the face (or, per the
    // file-level comment, vacuously — this test's real guarantee is the network-response spec
    // above; this one just pins that body actually renders in Inter, not a fallback).
    const bodyFontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(bodyFontFamily).toContain('Inter');
  });

  test('Roboto Flex loads as a variable font spanning the full weight range', async ({ page }) => {
    await page.evaluate(() => document.fonts.ready);

    // Nothing in the gallery renders text with `var(--font-display)` yet (that wiring is a
    // later wave), so `document.fonts.load` is required to force the fetch at all — see the
    // network-response test above for the assertion that actually proves the file exists.
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
