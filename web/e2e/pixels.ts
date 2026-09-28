import type { Locator, Page } from '@playwright/test';

/** Reading what reached the screen rather than what the CSS asked for. */

export type Rgb = [number, number, number];

/** The element's own pixels, as rows of [r, g, b], decoded in the page from its screenshot. */
export async function pixels(page: Page, element: Locator): Promise<Rgb[][]> {
  const png = (await element.screenshot({ animations: 'disabled' })).toString('base64');
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const g = canvas.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, img.width, img.height).data;
    const rows: [number, number, number][][] = [];
    for (let y = 0; y < img.height; y++) {
      const row: [number, number, number][] = [];
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        row.push([px[i]!, px[i + 1]!, px[i + 2]!]);
      }
      rows.push(row);
    }
    return rows;
  }, png);
}

export const distance = (a: Rgb, b: Rgb) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

/** How colourful a region is: the mean spread between its strongest and weakest channel. */
export function chroma(rows: Rgb[][]) {
  const all = rows.flat();
  return all.reduce((sum, p) => sum + Math.max(...p) - Math.min(...p), 0) / all.length;
}
