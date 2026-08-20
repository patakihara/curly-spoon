/**
 * What the app shows when something is missing or broken.
 *
 * The rule these encode (docs/DESIGN.md) is that a failure is never a blank
 * screen: a list degrades to an inline message so the rest of the page stays
 * usable, a detail page hands off to the route's error boundary because it has
 * nothing else to show, and an address that matches no route gets a real
 * not-found page rather than an empty shell.
 */
import { expect, test } from '@playwright/test';

test('a missing item hands the route to the error boundary, with a way back', async ({ page }) => {
  // `ItemPage` rethrows a failed query rather than rendering an inline error —
  // a detail page with no item has nothing else worth showing. That throw is
  // only useful if the route's `errorComponent` actually catches it, which is
  // what this asserts.
  await page.goto('/item/no-such-item');

  const boundary = page.getByTestId('route-error-boundary');
  await expect(boundary).toBeVisible();
  await expect(boundary).toContainText('Something went wrong');
  await expect(page.getByTestId('route-error-retry')).toBeVisible();

  // The boundary replaces the route's content, not the whole app: navigation is
  // still there, so the user can leave without reaching for the back button.
  await expect(page.getByTestId('nav-rail-expanded')).toBeVisible();
});

test('the error boundary is scoped to the route, so navigating away recovers', async ({ page }) => {
  await page.goto('/item/no-such-item');
  await expect(page.getByTestId('route-error-boundary')).toBeVisible();

  await page.getByTestId('nav-rail-expanded').getByRole('button', { name: 'Browse' }).click();

  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page.getByTestId('route-error-boundary')).toHaveCount(0);
});

test('an address that matches no route gets a not-found page, not a blank shell', async ({
  page,
}) => {
  // Also proves the BFF's SPA fallback: this path is served by
  // `apps/server/src/static.ts` returning index.html, and the router — not the
  // server — decides it is unknown.
  await page.goto('/nothing/here');

  await expect(page.getByTestId('not-found-page')).toBeVisible();
  await expect(page.getByTestId('nav-rail-expanded')).toBeVisible();
});

test('a library that failed to load says so inline, and keeps the page usable', async ({
  page,
}) => {
  // The opposite policy to the detail page above: a list degrades in place.
  await page.goto('/library/no-such-library');

  await expect(page.getByTestId('library-page')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText("Couldn't load this library");
  await expect(page.getByTestId('route-error-boundary')).toHaveCount(0);
  await expect(page.getByTestId('nav-rail-expanded')).toBeVisible();
});
