import { expect, test } from '@playwright/test';

/**
 * A MediaCard's caption sits tight under its art, as tall as its own lines: nothing is reserved
 * for a second title line. A grid row or a shelf stretches its cards to the tallest, so their
 * hover areas end level, and where no title wraps there is no empty band under the subtitle.
 */

/** The home's first card grid: its row gap, and per row its top and each card's box and text bottoms. */
function rows() {
  const grid = [...document.querySelectorAll('div')].find(
    (d) => getComputedStyle(d).display === 'grid' && d.querySelector('img') !== null,
  );
  if (grid === undefined) throw new Error('no card grid');
  const cards = [...grid.querySelectorAll<HTMLElement>('[role="button"][aria-label]')];
  const byTop = new Map<number, { bottom: number; textBottom: number; lines: number }[]>();
  for (const card of cards) {
    const box = card.getBoundingClientRect();
    const texts = [...card.querySelectorAll<HTMLElement>('div')].filter(
      (d) => d.childElementCount === 0 && (d.textContent ?? '').trim() !== '',
    );
    const title = texts.find((t) => t.textContent === card.getAttribute('aria-label'));
    if (title === undefined) throw new Error('a card without its title');
    const top = Math.round(box.top);
    byTop.set(top, [
      ...(byTop.get(top) ?? []),
      {
        bottom: box.bottom,
        textBottom: Math.max(...texts.map((t) => t.getBoundingClientRect().bottom)),
        lines: Math.round(
          title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight),
        ),
      },
    ]);
  }
  return {
    rowGap: parseFloat(getComputedStyle(grid).rowGap),
    rows: [...byTop.entries()].sort((a, b) => a[0] - b[0]).map(([top, cards]) => ({ top, cards })),
  };
}

for (const home of ['/music', '/books', '/podcasts']) {
  test(`[M0.sonoraclean] ${home} at 1440 px: a row of one-line titles sits one gutter above the next, no band under its captions`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(home);
    await page.locator('img').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const { rowGap, rows: found } = await page.evaluate(rows);
    // The gutter as it was before captions reserved a second title line (20 px at 1440).
    expect(rowGap).toBe(20);
    const level = found.filter((r) => r.cards.every((c) => c.lines === 1));
    expect(level.length, 'a row whose titles all run one line').toBeGreaterThan(0);
    for (const row of level) {
      for (const card of row.cards) {
        expect(card.bottom - card.textBottom, 'the card ends at its subtitle').toBeLessThan(1);
      }
      const next = found.find((r) => r.top > row.top);
      if (next === undefined) continue;
      const end = Math.max(...row.cards.map((c) => c.textBottom));
      expect(Math.abs(next.top - end - rowGap), 'one gutter to the next row').toBeLessThan(1);
    }
  });
}
