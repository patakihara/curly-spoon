/**
 * Regression test for wave 14c (docs/HANDOVER.md's "Home's CLS regressed since phase 10"
 * finding). This is the reader for that finding's writer: a threshold that fails loudly if
 * Home's layout shift gets meaningfully worse, rather than a number nobody watches.
 *
 * Attribution (a throwaway `PerformanceObserver` spec, deleted before this commit) was run
 * twice: once on `9e87fdc` (with `packages/ui`'s `sideEffects` field still present) and again
 * after rebasing onto `418b0d1`, which reverts that field because it destabilised a *different*
 * skeleton assertion on CI. **The two runs named the same culprit**, so this is not an artifact
 * of the reverted change — re-measuring after the rebase was the check, and it held.
 *
 * The shift is **not** cover-art images loading without dimensions — `CoverImage` already
 * renders every card's artwork at a fixed `width`/`height`
 * (`apps/web/src/components/CoverImage.tsx`), so the browser reserves that box before the bytes
 * arrive. Every run's dominant shift traced back to the same architectural cause instead: Home
 * stitches four independent async sources (Audiobookshelf book shelves, podcast shelves,
 * Jellyfin favourite albums, and the recommendation shelves) client-side (`HomePage.tsx`'s own
 * header), and whether a given source's data lands *before* or *after* the browser's first
 * paint is a race with no reserved space on the losing side — a shelf `<section>` or a
 * `quick-picks-grid` tile pops in from a zero-size rect instead of replacing an equally-sized
 * skeleton. The same shelf sometimes shows in the very first paint (no shift attributed) and
 * sometimes pops in after (a large one), which is why the total swings run to run even on the
 * post-revert build: two consecutive desktop runs held near-identical (0.1452, 0.1465), while
 * two consecutive mobile runs, same page, same build, back-to-back in one browser context, gave
 * 0.1675 and 0.4090 — the *culprit* (the same shelf sections and quick-pick tiles) was identical
 * both times, only the paint-vs-arrival race outcome differed.
 *
 * That variance is the reason this file does not attempt a tight budget, and does not attempt
 * a fix: reserving space for a shelf whose existence isn't yet known (how many book shelves
 * will there be?) means either a generic skeleton block that wasn't there before, or holding
 * the whole page in its loading state until every source settles — both are visible changes to
 * what a user sees before their data arrives, which is a product call for the shelf count/
 * loading-state design, not a layout bug this wave's spec authorizes fixing unilaterally.
 *
 * The threshold below is a smoke ceiling, not a tight budget: comfortably above every value
 * observed across both attribution passes (worst was 0.4090), so it stays silent on today's
 * known timing noise but fails on a genuine regression — e.g. a future change that makes the
 * shift structurally worse (an image rendered without `width`/`height`, a new source added with
 * no loading placeholder at all) rather than merely re-timing the existing races.
 */
import { expect, type Page, test } from '@playwright/test';

const FAKE_JELLYFIN_BASE_URL = 'http://fake.jellyfin.local';
const FAKE_JELLYFIN_USERNAME = 'nova';
const FAKE_JELLYFIN_PASSWORD = 'stardust1';

/** Comfortably above every real-browser measurement taken across both attribution passes
 * (worst 0.4090) — see this file's header for why a tight budget would be noise, not signal,
 * on this specific page. */
const CLS_SMOKE_CEILING = 0.7;

test.beforeEach(async ({ page }) => {
  // Neutralise the audio element — same reasoning as e2e/app/for-you.spec.ts's beforeEach:
  // the fixture audio can't decode in a real browser, and nothing this file asserts is about
  // playback.
  await page.addInitScript(() => {
    const proto = HTMLMediaElement.prototype;
    proto.play = () => Promise.resolve();
    proto.pause = function () {};
    Object.defineProperty(proto, 'src', {
      configurable: true,
      get(this: HTMLMediaElement & { _auralisSrc?: string }) {
        return this._auralisSrc ?? '';
      },
      set(this: HTMLMediaElement & { _auralisSrc?: string }, value: string) {
        this._auralisSrc = value;
      },
    });
  });
});

test('Home does not regress past a CLS smoke ceiling', async ({ page }) => {
  // Own precondition, per playwright.config.ts's rule for the `app` project: connect
  // Jellyfin and favourite an album (idempotently — Jellyfin's connect state is
  // process-global, so another spec file may already have done this) so the music
  // carousel has data, the same content mix the attribution run above used.
  await page.goto('/settings');
  await page.getByTestId('jellyfin-base-url-input').fill(FAKE_JELLYFIN_BASE_URL);
  await page.getByTestId('jellyfin-username-input').fill(FAKE_JELLYFIN_USERNAME);
  await page.getByTestId('jellyfin-password-input').fill(FAKE_JELLYFIN_PASSWORD);
  await page.getByTestId('jellyfin-connect-submit').click();
  await expect(page.getByTestId('jellyfin-status-connected')).toBeVisible();

  await page.goto('/music/album/album-driftwave');
  const favoriteToggle = page.getByTestId('music-album-favorite');
  await expect(favoriteToggle).toBeVisible();
  const alreadyFavorite = (await favoriteToggle.getAttribute('aria-pressed')) === 'true';
  if (!alreadyFavorite) {
    await favoriteToggle.click();
    await expect(favoriteToggle).toHaveAttribute('aria-pressed', 'true');
  }

  await installClsObserver(page);

  // The mobile viewport is the stricter, more variable one in the attribution run (see this
  // file's header), so it is the one asserted on here.
  await page.setViewportSize({ width: 412, height: 823 });
  await page.goto('/');
  await expect(page.getByTestId('home-page')).toBeVisible();
  // Generous fixed wait: Home's async sources (books, podcasts, music, recommendations)
  // settle independently, and this needs to observe all of them, not assert on timing.
  await page.waitForTimeout(5000);

  const total = await page.evaluate(
    () => (window as unknown as { __auralisClsTotal: number }).__auralisClsTotal,
  );

  expect(total).toBeLessThan(CLS_SMOKE_CEILING);
});

/** Installs a real `PerformanceObserver` for `layout-shift` entries before navigation, summing
 * every entry whose `hadRecentInput` is false into `window.__auralisClsTotal` — the same
 * definition Lighthouse's CLS metric uses. Registered via `addInitScript` so it is present from
 * the very first paint of the next navigation, not attached after the fact. */
async function installClsObserver(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __auralisClsTotal: number };
    w.__auralisClsTotal = 0;
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as Array<{
        hadRecentInput: boolean;
        value: number;
      }>) {
        if (entry.hadRecentInput) continue;
        w.__auralisClsTotal += entry.value;
      }
    });
    po.observe({ type: 'layout-shift', buffered: true });
  });
}
