/**
 * The book detail screen's Sonora restyle (docs/design/screens/BOOK_DETAIL.md,
 * wave 16e-book-W). `player.spec.ts` covers the two chapter-tap behaviours;
 * `series-author.spec.ts` covers the author link's navigation. This file covers:
 *
 * - that the restyle actually applied — Playwright asserts testids and text and
 *   never computed styles, so a component can render completely unstyled and pass
 *   every other test in this suite (the documented 14a-2 failure mode); the token
 *   checks here read `getComputedStyle` against a same-scope probe, the pattern
 *   `e2e/ui/dialog.spec.ts` and `e2e/app/settings-a11y.spec.ts` already use.
 * - the degenerate cases §5's fallback-contract table names: a book with no
 *   author, no narrator, no chapters, no description and no cover, which no
 *   fixture item happens to be, so it is built here via `page.route`.
 * - the mobile centered-column layout switch.
 */
import { expect, test } from '@playwright/test';

test('a book with no author, no narrator, no chapters, no description and no cover degrades cleanly', async ({
  page,
}) => {
  await page.route('**/api/v1/items/item-dune*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        item: {
          id: 'item-dune',
          libraryId: 'lib-books',
          coverPath: null,
          media: {
            kind: 'book',
            title: 'The Silent Orchard',
            subtitle: null,
            authors: [],
            narrator: null,
            description: null,
            chapters: [],
          },
          progress: null,
        },
      }),
    });
  });

  await page.goto('/item/item-dune');
  const itemPage = page.getByTestId('item-page');
  await expect(itemPage).toBeVisible();
  await expect(itemPage.getByRole('heading', { name: 'The Silent Orchard' })).toBeVisible();

  // No author row at all — not an empty clickable region (spec §5's fallback table).
  await expect(page.getByTestId('item-author-link')).toHaveCount(0);
  await expect(page.locator('.auralis-item-header__subtitle')).toHaveCount(0);
  // No narrator segment, and — since every other field is absent too — no meta
  // line at all rather than a run of bare "· ·" separators.
  await expect(page.getByText('Narrated by', { exact: false })).toHaveCount(0);
  await expect(page.locator('.auralis-item-header__meta-line')).toHaveCount(0);
  // No "Chapters" heading, no empty list — a single-file audiobook is a normal
  // case, not an error state.
  await expect(page.getByTestId('item-chapters')).toHaveCount(0);
  await expect(itemPage.getByRole('heading', { name: 'Chapters' })).toHaveCount(0);
  // `RichDescription` already renders nothing for a null description.
  await expect(page.getByTestId('item-description')).toHaveCount(0);
  // No cover URL to fail on, so the fallback path renders directly: a tonal
  // tile, never a broken/absent <img> left in the DOM.
  await expect(page.locator('.auralis-item-header img')).toHaveCount(0);

  // Still a working page: no stored progress, so "Play", not "Resume".
  await expect(page.getByTestId('item-play')).toHaveText('Play');
});

test('the header switches to a centered column layout at compact width', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 900 });
  await page.goto('/item/item-dune');
  await expect(page.getByTestId('item-page')).toBeVisible();

  await expect(page.locator('.auralis-item-header')).toHaveClass(/auralis-item-header--compact/);
});

test('the composed meta line reads narrator, duration, chapter count and progress in order', async ({
  page,
}) => {
  // item-dune (items-books.json): narrator "Simon Vance", duration 1260s (21m),
  // two chapters, no stored progress — so the progress segment is absent too,
  // which is itself part of what this test pins (no trailing "· 0% listened").
  await page.goto('/item/item-dune');
  await expect(page.getByTestId('item-page')).toBeVisible();

  await expect(page.locator('.auralis-item-header__meta-line')).toHaveText(
    'Narrated by Simon Vance · 21 m · 2 chapters',
  );
});

test('the restyled header actually resolves Sonora tokens, not just renders unstyled', async ({
  page,
}) => {
  await page.goto('/item/item-dune');
  await expect(page.getByTestId('item-page')).toBeVisible();

  const title = page.getByTestId('item-page').getByRole('heading', { name: 'Dune' });

  // Weight/family are literal values, not custom properties — assert directly.
  await expect(title).toHaveCSS('font-weight', '900');
  const fontFamily = await title.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(fontFamily).toMatch(/Roboto Flex/);

  // `color: var(--surface-fg)` is theme-scoped with no `:root` fallback — a
  // probe in the same DOM scope proves it resolved to a real value, and that
  // the title's own rendered colour is exactly that value (not a leftover
  // literal), the same technique `dialog.spec.ts` uses for a theme-scoped panel.
  const [titleColor, expectedColor] = await title.evaluate((el) => {
    const actual = getComputedStyle(el).color;
    const probe = document.createElement('span');
    probe.style.color = 'var(--surface-fg)';
    el.parentElement?.appendChild(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return [actual, expected];
  });
  expect(expectedColor).not.toBe('');
  expect(titleColor).toBe(expectedColor);

  // NOT the cover's `var(--radius-lg)` — that style prop only reaches the
  // *loaded* `<MantineImage>`; `CoverImage`'s fallback tile (rendered here,
  // since this environment's fixture cover bytes never decode) hardcodes its
  // own 8px radius regardless of the caller's `style` prop. Pre-existing
  // (`PodcastDetailPage.tsx` carries the identical mismatch) and out of this
  // screen-scoped wave — recorded rather than silently asserted around.
  const cover = page.locator('.auralis-item-header [aria-hidden="true"]').first();
  await expect(cover).toBeVisible();
  await expect(cover).toHaveCSS('border-radius', '8px');

  // The author link's `--accent-ink` colour, same probe technique.
  const authorLink = page.getByTestId('item-author-link');
  const [linkColor, expectedLinkColor] = await authorLink.evaluate((el) => {
    const actual = getComputedStyle(el).color;
    const probe = document.createElement('span');
    probe.style.color = 'var(--accent-ink)';
    el.parentElement?.appendChild(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return [actual, expected];
  });
  expect(expectedLinkColor).not.toBe('');
  expect(linkColor).toBe(expectedLinkColor);
});
