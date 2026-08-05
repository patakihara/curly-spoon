/**
 * Every assertion in the suite that requires Jellyfin to be **not** connected.
 *
 * Jellyfin's settings row is process-global (`GET/POST /jellyfin/config`,
 * `routes/jellyfin.ts`), not scoped to the signed-in Auralis session — the same
 * "the BFF is single-tenant and stateful" fact `onboarding.spec.ts` is built
 * around (`docs/HANDOVER.md` §4). So the moment any spec connects Jellyfin, the
 * unconfigured state is gone for every other spec sharing this `webServer`.
 *
 * `describe.configure({ mode: 'serial' })` is not enough to protect that: it
 * orders tests *within* one file, and Playwright still hands different files to
 * different workers in parallel. `music.spec.ts` and `search-music.spec.ts` each
 * owned an unconfigured-state assertion followed by a connect, and each was
 * internally serial — which held right up until a second worker existed. On CI
 * (`workers: 2`) they raced, and `search-music.spec.ts`'s opening assertion
 * failed against a Jellyfin `music.spec.ts` had already connected.
 *
 * The fix is the mechanism `app-onboarding` already uses for exactly this
 * problem, one level down: these assertions live in their own project
 * (`app-jellyfin-unconfigured`) which the `app` project declares a dependency
 * on, so Playwright finishes this file *entirely* before any file that can
 * connect Jellyfin starts. Nothing here may connect — that is the whole
 * contract of this file.
 */
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('an unconfigured Jellyfin sends /music to the connect prompt, not an empty library', async ({
  page,
}) => {
  // Signed in already, via this project's `storageState`.
  await page.goto('/settings');
  await expect(page.getByTestId('jellyfin-status-disconnected')).toBeVisible();

  await page.goto('/music');
  await expect(page.getByTestId('music-page')).toBeVisible();
  await expect(page.getByTestId('music-unconfigured')).toBeVisible();

  await page.getByTestId('music-connect-cta').click();
  await expect(page.getByTestId('settings-page')).toBeVisible();
});

test('no music section renders in search while Jellyfin is unconfigured, even for a matching term', async ({
  page,
}) => {
  await page.goto('/settings');
  await expect(page.getByTestId('jellyfin-status-disconnected')).toBeVisible();

  await page.goto('/search');
  await page.getByTestId('search-field').getByRole('combobox').fill('dune');

  await expect(page.getByTestId('search-results-books')).toBeVisible();
  await expect(page.getByTestId('search-result-item-dune')).toBeVisible();
  await expect(page.getByTestId('search-results-music')).toHaveCount(0);

  // The status line stays in its original two-part shape — no music mention,
  // no fired-and-discarded Jellyfin request to reason about.
  await expect(page.getByTestId('search-status')).toContainText(
    '1 book, 0 podcasts found for "dune".',
  );
});
