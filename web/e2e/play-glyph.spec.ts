import { expect, test } from '@playwright/test';
import { distance, pixels, type Rgb } from './pixels';

/**
 * Sonora's rose play and pause buttons, read from the rendered pixels rather than from computed
 * style: a glyph can be white in CSS and still reach the screen as a hairline ring, since the icon
 * font draws its outline unless told to fill.
 */

const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

/**
 * The runs of near-white pixels across the middle row of the glyph on a round button: the glyph
 * is whatever inside the circle differs from the fill, read just above the glyph.
 */
function glyphRow(rows: Rgb[][]) {
  const h = rows.length;
  const w = rows[0]!.length;
  const fill = rows[Math.round(h * 0.15)]![w >> 1]!;
  let top = h;
  let bottom = -1;
  let left = w;
  let right = -1;
  const r = (w / 2) * 0.8;
  rows.forEach((row, y) =>
    row.forEach((p, x) => {
      if ((x - w / 2) ** 2 + (y - h / 2) ** 2 > r * r || distance(p, fill) <= 60) return;
      [top, bottom, left, right] = [
        Math.min(top, y),
        Math.max(bottom, y),
        Math.min(left, x),
        Math.max(right, x),
      ];
    }),
  );
  const middle = rows[Math.round((top + bottom) / 2)]!.slice(left, right + 1);
  const runs: Rgb[][] = [];
  let run: Rgb[] | undefined;
  for (const p of middle) {
    if (Math.min(...p) >= 200) {
      if (run === undefined) runs.push((run = []));
      run.push(p);
    } else run = undefined;
  }
  return { fill, runs };
}

for (const size of SIZES) {
  test(`[M0.canvas] every rose pause button draws its glyph as solid white bars on a ${size.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.goto('/books/sample');
    await page.evaluate(() => document.fonts.ready);
    const buttons = await page.getByRole('button', { name: 'Pause' }).all();
    let checked = 0;
    for (const button of buttons) {
      const background = await button.evaluate((b) => getComputedStyle(b).backgroundColor);
      if (background !== 'rgb(244, 72, 98)') continue;
      const { fill, runs } = glyphRow(await pixels(page, button));
      expect(fill).toEqual([244, 72, 98]);
      // A filled pause glyph crosses its middle row as two white bars; the outlined one the font
      // draws by default crosses it as four hairlines, tinted, around a rose middle.
      expect(runs.map((run) => run.length >= 3)).toEqual([true, true]);
      for (const run of runs)
        expect(Math.min(...run[run.length >> 1]!)).toBeGreaterThanOrEqual(245);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
}
