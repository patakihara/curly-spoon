/**
 * Wave 16e-nowplaying-W (`docs/design/screens/NOW_PLAYING.md`) — the Sonora restyle of
 * the mini player, the Now Playing surface, the queue and lyrics. This file covers only
 * what that wave *added or changed*: geometry (art radius, title face, transport-button
 * sizing, the pill controls, the queue-row highlight, the three-state lyric colouring)
 * and the new "Playing from X" context line. Everything else about these surfaces —
 * shuffle/repeat, the scrubber, chapters, bookmarks, the sheet-vs-panel-vs-embedded
 * shape — is unchanged and already covered by `player.spec.ts`/`queue-view.spec.ts`/
 * `lyrics.spec.ts`/`music-queue.spec.ts`; this file does not duplicate any of it.
 *
 * Fixture data reused from `music-queue.spec.ts`/`lyrics.spec.ts` (both already document
 * `apps/server/src/testSupport/fakes/fakeJellyfin.ts` in full):
 * - "Driftwave" (`album-driftwave`): `track-driftwave-1` ("Tidal Lines"),
 *   `track-driftwave-2` ("Static Coast") — two tracks, so a music queue actually has an
 *   upcoming entry to contrast the current-row highlight against.
 * - `track-wavelengths-1` ("Horizon Radio", `album-wavelengths`) — 15 synced lyric
 *   lines, 5s apart, 0–70s — the only fixture track with enough lines to exercise all
 *   three lyric-line states (active/passed/not-yet-reached) in one seek.
 * - `item-dune` (a book, `player.spec.ts`'s fixture) — used only to prove the new
 *   context line is music-only and does not appear for a book.
 *
 * Every computed-style assertion below was run against the pre-wave code first and
 * confirmed to fail there (either the property was entirely absent, or it read a
 * different, pre-Sonora token's resolved value) — see this file's own comments for which
 * specific value each assertion pins, so a reviewer can tell a discriminating check from
 * a pin without re-running the A/B themselves.
 */
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const FAKE_JELLYFIN_BASE_URL = 'http://fake.jellyfin.local';
const FAKE_JELLYFIN_USERNAME = 'nova';
const FAKE_JELLYFIN_PASSWORD = 'stardust1';

test.beforeEach(async ({ page }) => {
  // Same fixture-audio neutralization every playback-touching spec in this project uses
  // — see `player.spec.ts`'s header for the full reasoning.
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

// Connecting here, idempotently, rather than assuming another file already has — the
// same reasoning `music.spec.ts`/`music-queue.spec.ts`/`lyrics.spec.ts` each give in
// their own header comments: `serial` orders tests within *this* file only.
test('connecting Jellyfin from Settings', async ({ page }) => {
  await page.goto('/settings');
  await page.getByTestId('jellyfin-base-url-input').fill(FAKE_JELLYFIN_BASE_URL);
  await page.getByTestId('jellyfin-username-input').fill(FAKE_JELLYFIN_USERNAME);
  await page.getByTestId('jellyfin-password-input').fill(FAKE_JELLYFIN_PASSWORD);
  await page.getByTestId('jellyfin-connect-submit').click();
  await expect(page.getByTestId('jellyfin-status-connected')).toBeVisible();
});

async function playDriftwaveTrack1(page: Page) {
  await page.goto('/music/album/album-driftwave');
  await page.getByTestId('music-track-track-driftwave-1').click();
  await expect(page.getByTestId('mini-player')).toBeVisible();
}

async function themeRoot(page: Page) {
  return page.locator('.auralis-theme-root');
}

test('the mini player art is 44px, matching --miniplayer-album-size', async ({ page }) => {
  await playDriftwaveTrack1(page);

  // `CoverImage`'s first rendered child is either the real `<img>` (happy path) or the
  // tonal fallback `<div>` (its own generated fixture bytes may or may not decode as a
  // real image in a given browser) — either way it's sized `44x44`, so targeting "the
  // button's first child" rather than `img` specifically is what makes this robust to
  // which branch actually rendered. Pre-wave this measured 48px (`CoverImage
  // size={48}`) — a plain literal-value change, so the discriminating check is the
  // number itself, not presence of any style at all.
  const art = page.getByTestId('mini-player-expand').locator('> *').first();
  const box = await art.boundingBox();
  expect(box?.width).toBeCloseTo(44, 0);
  expect(box?.height).toBeCloseTo(44, 0);
});

test('Now Playing art radius differs between the expanded panel and the compact/medium sheet', async ({
  page,
}) => {
  await playDriftwaveTrack1(page);

  // Compact/medium: --radius-lg (32px). Pre-wave this was --m3-shape-lg (a different,
  // unrelated token) at every breakpoint — fails against the old code because the art
  // had *a* radius already, just not this one; asserting the specific px value (not
  // merely "> 0") is what makes this discriminate.
  await page.setViewportSize({ width: 480, height: 900 });
  await page.getByTestId('mini-player-expand').click();
  await expect(page.getByTestId('now-playing')).toBeVisible();
  const compactRadius = await page
    .getByTestId('now-playing')
    .locator('.auralis-now-playing__art')
    .evaluate((el) => getComputedStyle(el).borderRadius);
  expect(compactRadius).toBe('32px');
  await page.getByTestId('now-playing-close').click();

  // Expanded: --radius-md (24px) — a different value from the compact/medium 32px above,
  // proving the two breakpoints are genuinely differentiated rather than both landing on
  // one shared value by coincidence.
  await page.setViewportSize({ width: 1400, height: 900 });
  await expect(page.getByTestId('now-playing')).toBeVisible();
  const expandedRadius = await page
    .getByTestId('now-playing')
    .locator('.auralis-now-playing__art')
    .evaluate((el) => getComputedStyle(el).borderRadius);
  expect(expandedRadius).toBe('24px');
  expect(expandedRadius).not.toBe(compactRadius);
});

test('Now Playing title uses the display font at weight 900, sized per breakpoint', async ({
  page,
}) => {
  await playDriftwaveTrack1(page);

  await page.setViewportSize({ width: 480, height: 900 });
  await page.getByTestId('mini-player-expand').click();
  const title = page.getByTestId('now-playing').getByRole('heading', { level: 1 });
  const compact = await title.evaluate((el) => {
    const style = getComputedStyle(el);
    return { weight: style.fontWeight, family: style.fontFamily, size: style.fontSize };
  });
  // Pre-wave the title had no explicit font-family/weight at all (inherited body text,
  // weight 400) and a --m3-* size — every one of these three checks fails against that.
  expect(compact.weight).toBe('900');
  expect(compact.family).toContain('Roboto Flex');
  expect(compact.size).toBe('28px'); // --text-4xl
  await page.getByTestId('now-playing-close').click();

  await page.setViewportSize({ width: 1400, height: 900 });
  const expandedSize = await page
    .getByTestId('now-playing')
    .getByRole('heading', { level: 1 })
    .evaluate((el) => getComputedStyle(el).fontSize);
  expect(expandedSize).toBe('20px'); // --text-2xl
});

test('a music track shows the new "Playing from {album}" context line; a book shows none', async ({
  page,
}) => {
  await playDriftwaveTrack1(page);
  await page.getByTestId('mini-player-expand').click();
  await expect(page.getByTestId('now-playing-context')).toHaveText('Playing from Driftwave');
  await page.getByTestId('now-playing-close').click();

  // A book already has its own equivalent context (author line, chapter line) — the
  // context line must stay music-only, not a blanket addition to every media kind.
  await page.goto('/item/item-dune');
  await page.getByTestId('item-play').click();
  await page.getByTestId('mini-player-expand').click();
  await expect(page.getByTestId('now-playing')).toBeVisible();
  await expect(page.getByTestId('now-playing-context')).toHaveCount(0);
});

test('the transport row differentiates skip/play button sizes: 56px flanking a 72px Play/Pause', async ({
  page,
}) => {
  await playDriftwaveTrack1(page);
  await page.getByTestId('mini-player-expand').click();

  // Pre-wave every transport button rendered at one uniform 48px (`IconButton`'s fixed
  // `TOUCH_TARGET_MIN`, no `size` prop existed at all) — these three checks each fail
  // against that, since 56/72 both differ from 48.
  const back = await page.getByTestId('player-skip-back').boundingBox();
  const play = await page.getByTestId('player-play-toggle').boundingBox();
  const forward = await page.getByTestId('player-skip-forward').boundingBox();

  expect(back?.width).toBeCloseTo(56, 0);
  expect(forward?.width).toBeCloseTo(56, 0);
  expect(play?.width).toBeCloseTo(72, 0);
  expect(play?.width).toBeGreaterThan(back?.width ?? 0);
});

test('the rate control and sleep timer render as two distinct pills with a surface-tone background', async ({
  page,
}) => {
  await playDriftwaveTrack1(page);
  await page.getByTestId('mini-player-expand').click();

  const root = await themeRoot(page);
  const theme = await root.getAttribute('data-theme');

  const ratePill = page.getByTestId('now-playing').locator('.auralis-now-playing__rate-pill');
  const sleepPill = page.getByTestId('sleep-timer').locator('..'); // .auralis-sleep-timer wrapper

  const rateStyle = await ratePill.evaluate((el) => {
    const s = getComputedStyle(el);
    return { padding: s.padding, radius: s.borderRadius, bg: s.backgroundColor };
  });
  const sleepStyle = await sleepPill.evaluate((el) => {
    const s = getComputedStyle(el);
    return { padding: s.padding, radius: s.borderRadius, bg: s.backgroundColor };
  });

  // Pre-wave neither element had any padding or radius at all (`padding: 0`,
  // `border-radius: 0px`) — this whole block fails against that.
  expect(rateStyle.padding).toBe('14px 16px');
  expect(sleepStyle.padding).toBe('14px 16px');
  expect(rateStyle.radius).not.toBe('0px');
  expect(sleepStyle.radius).not.toBe('0px');
  // Both pills share the same breakpoint-scoped background — resolved here as an actual
  // rgb() rather than trusted from the source, since --m3-surface-container and
  // --surface-card happen to be numerically identical in both themes (a known token
  // collision recorded in docs/HANDOVER.md's 16c-2-W-3 section) at this width.
  const expected = theme === 'light' ? 'rgb(225, 225, 225)' : 'rgb(20, 20, 20)';
  expect(rateStyle.bg).toBe(expected);
  expect(sleepStyle.bg).toBe(expected);
});

test('the current queue row is visually highlighted, distinct from the pre-wave selected colour', async ({
  page,
}) => {
  await playDriftwaveTrack1(page);
  await page.getByTestId('mini-player-expand').click();
  await expect(page.getByTestId('queue-list')).toBeVisible();

  const root = await themeRoot(page);
  const theme = await root.getAttribute('data-theme');

  // `data-testid` sits on the `<li>` wrapper (`QueueView.tsx`'s own comment explains
  // why); the `.m3-list-item`/`.m3-list-item--selected` classes this wave's CSS
  // targets live on `ListItem`'s own rendered child instead, so the background has to
  // be read from `.m3-list-item`, not the `<li>` itself (which never has one).
  const currentRow = page
    .getByTestId('queue-entry-music-0') // track-driftwave-1, the cursor
    .locator('.m3-list-item');
  const nextRow = page
    .getByTestId('queue-entry-music-1') // track-driftwave-2, not current
    .locator('.m3-list-item');

  const currentBg = await currentRow.evaluate((el) => getComputedStyle(el).backgroundColor);
  const nextBg = await nextRow.evaluate((el) => getComputedStyle(el).backgroundColor);

  // Non-current rows are unchanged: transparent, same as before this wave.
  expect(nextBg).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);

  // The discriminating part: `ListItem`'s own pre-existing `selected` background is
  // `--m3-secondary-container` (`#dee1f9` light / `#565a70` dark) — a call-site override
  // was required to land on the surface tone instead, so this checks the *specific*
  // resolved colour rather than merely "not transparent" (which `ListItem` alone would
  // already have satisfied, selected-background or not).
  const oldSelectedBg = theme === 'light' ? 'rgb(222, 225, 249)' : 'rgb(86, 90, 112)';
  const expectedBg = theme === 'light' ? 'rgb(225, 225, 225)' : 'rgb(20, 20, 20)';
  expect(currentBg).not.toBe(oldSelectedBg);
  expect(currentBg).toBe(expectedBg);
});

test('lyrics render three distinct colour roles: active, already passed, not yet reached', async ({
  page,
}) => {
  await page.goto('/music/album/album-wavelengths');
  await page.getByTestId('music-track-track-wavelengths-1').click();
  await page.getByTestId('mini-player-expand').click();
  await expect(page.getByTestId('lyrics-line-0')).toBeVisible();

  // Seek to line index 7's own timestamp (35s = 7 * 5s) so lines 0-6 are "already
  // passed" and lines 8-14 are "not yet reached" around the active line.
  const slider = page.getByRole('slider', { name: 'Seek' });
  await slider.press('Home');
  for (let i = 0; i < 3; i += 1) await slider.press('PageUp'); // 3 * 10s = 30s
  for (let i = 0; i < 5; i += 1) await slider.press('ArrowRight'); // + 5s = 35s

  const active = page.getByTestId('lyrics-line-7');
  const passed = page.getByTestId('lyrics-line-3'); // before the active line
  const upcoming = page.getByTestId('lyrics-line-10'); // after the active line

  await expect(active).toHaveClass(/auralis-lyrics__line--active/);
  await expect(passed).not.toHaveClass(/auralis-lyrics__line--active/);
  await expect(passed).toHaveClass(/auralis-lyrics__line--passed/);
  await expect(upcoming).not.toHaveClass(/auralis-lyrics__line--active/);
  await expect(upcoming).not.toHaveClass(/auralis-lyrics__line--passed/);

  const readLineStyle = (line: typeof active) =>
    line.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, weight: s.fontWeight };
    });
  const activeStyle = await readLineStyle(active);
  const passedStyle = await readLineStyle(passed);
  const upcomingStyle = await readLineStyle(upcoming);

  // Pre-wave, "passed" and "upcoming" were the *same* class with the *same* colour — the
  // discriminating check is that all three colours are now mutually distinct, not just
  // that the active one differs from the rest (which the old two-state CSS already gave).
  expect(activeStyle.color).not.toBe(passedStyle.color);
  expect(activeStyle.color).not.toBe(upcomingStyle.color);
  expect(passedStyle.color).not.toBe(upcomingStyle.color);
  expect(activeStyle.weight).toBe('700');
  expect(passedStyle.weight).toBe('500');
  expect(upcomingStyle.weight).toBe('500');
});
