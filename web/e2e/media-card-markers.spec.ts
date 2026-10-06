import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * A round MediaCard is a person's card: its art is a circle. Every marker a card carries on its
 * art (progress, the "Not in library" pill, a request's status, the saved ribbon, the unplayed
 * dot, the corner More) stays whole inside that circle, legible, on a phone and a desktop.
 */

type Box = { x: number; y: number; width: number; height: number };

const box = async (l: Locator): Promise<Box> => {
  const b = await l.boundingBox();
  if (b === null) throw new Error('not rendered');
  return b;
};

/** Each marker: its name, the states card that carries it, and how to find it there. */
/** The corner More and a requestable card's menu are on the art too, so they count. */
const MARKERS: { name: string; marker: string; find: (card: Locator) => Locator }[] = [
  { name: 'progress', marker: 'progress', find: (c) => c.getByRole('progressbar') },
  { name: 'absent', marker: 'absent', find: (c) => c.locator('[title="Not in library"]') },
  {
    name: 'download',
    marker: 'download',
    find: (c) => c.locator('[title="Downloading 45%"] > span'),
  },
  { name: 'requested', marker: 'requested', find: (c) => c.locator('[title="Requested"] > span') },
  { name: 'saved', marker: 'saved', find: (c) => c.locator('[title="Saved"]') },
  { name: 'unplayed dot', marker: 'unplayed', find: (c) => c.locator('[title="Unplayed"]') },
  {
    name: 'corner More',
    marker: 'unplayed',
    find: (c) => c.getByRole('button', { name: 'More options' }),
  },
  {
    name: 'request menu',
    marker: 'requestable',
    find: (c) => c.getByRole('button', { name: 'More options' }),
  },
];

const open = async (page: Page, shape: 'round' | 'square') => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/states.html?card=${shape}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
};

for (const platform of ['mobile', 'desktop'] as const) {
  for (const { name, marker, find } of MARKERS) {
    test(`[M0.sonoraclean] a round MediaCard shows its ${name} whole inside the circle, on ${platform}`, async ({
      page,
    }) => {
      await open(page, 'round');
      const card = page.locator(`[data-marker="${marker}"][data-platform="${platform}"]`);
      const art = card.locator('div[style*="aspect-ratio"]').first();
      const el = find(card).first();
      await expect(el).toBeVisible();
      const a = await box(art);
      const m = await box(el);
      const r = a.width / 2;
      const cx = a.x + r;
      const cy = a.y + a.height / 2;
      for (const [x, y] of [
        [m.x, m.y],
        [m.x + m.width, m.y],
        [m.x, m.y + m.height],
        [m.x + m.width, m.y + m.height],
      ] as const) {
        expect(
          Math.hypot(x - cx, y - cy),
          `corner ${x},${y} lies inside the circle`,
        ).toBeLessThanOrEqual(r + 0.5);
      }
      const overflow = await el.evaluate((e) => e.scrollWidth - e.clientWidth);
      expect(overflow, 'its content is not cut off inside it').toBeLessThanOrEqual(0);
    });
  }
}

test('[M0.sonoraclean] a square MediaCard keeps every marker on its art', async ({ page }) => {
  await open(page, 'square');
  for (const platform of ['mobile', 'desktop'] as const) {
    for (const { marker, find } of MARKERS) {
      const card = page.locator(`[data-marker="${marker}"][data-platform="${platform}"]`);
      const a = await box(card.locator('div[style*="aspect-ratio"]').first());
      const m = await box(find(card).first());
      expect(m.x).toBeGreaterThanOrEqual(a.x - 0.5);
      expect(m.y).toBeGreaterThanOrEqual(a.y - 0.5);
      expect(m.x + m.width).toBeLessThanOrEqual(a.x + a.width + 0.5);
      expect(m.y + m.height).toBeLessThanOrEqual(a.y + a.height + 0.5);
    }
  }
});

test('[M0.sonoraclean] a MediaCard title clamps to two lines, breaking a long word, and every card on a shelf ends level', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/states.html?card=titles', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const shelf = page.locator('[data-shelf]');
  const titles = [
    'Driftwave',
    'Aftershocks: the second call, live from the harbour',
    'Supercalifragilisticexpialidociousantidisestablishmentarianismness',
  ];
  const subs = ['Halcyon Bloom', 'Static & Signal', 'Long Word Ensemble'];
  const word = shelf.getByText(titles[2]!, { exact: true });
  const fit = await word.evaluate((e) => {
    const cs = getComputedStyle(e);
    return {
      overflowX: e.scrollWidth - e.clientWidth,
      lines: Math.round(e.clientHeight / parseFloat(cs.lineHeight)),
      clamp: cs.webkitLineClamp,
      wrap: cs.overflowWrap,
      ellipsis: e.scrollHeight > e.clientHeight,
    };
  });
  expect(
    fit.overflowX,
    'the long word breaks rather than running out of the card',
  ).toBeLessThanOrEqual(0);
  expect(fit.clamp, 'two lines at most').toBe('2');
  expect(fit.lines, 'and it fills both').toBe(2);
  expect(fit.ellipsis, 'what is left over is cut at the clamp, which draws the ellipsis').toBe(
    true,
  );
  expect(fit.wrap).toBe('anywhere');
  const heights = await Promise.all(
    titles.map(
      async (t) => (await box(shelf.getByRole('button', { name: t, exact: true }))).height,
    ),
  );
  expect(
    new Set(heights.map((h) => Math.round(h))).size,
    'every card on the shelf is one height, whatever its title runs to',
  ).toBe(1);
  for (const [i, t] of titles.entries()) {
    const title = await box(shelf.getByText(t, { exact: true }));
    const sub = await box(shelf.getByText(subs[i]!, { exact: true }));
    expect(
      sub.y - (title.y + title.height),
      `${subs[i]} sits right under its title`,
    ).toBeLessThanOrEqual(3);
  }
  for (const t of titles) await expect(shelf.getByText(t, { exact: true })).toBeVisible();
});
