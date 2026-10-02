import { expect, test, type Page } from '@playwright/test';
import { navPages, pathOf } from './nav-pages';

/**
 * The container serves every font and icon itself. `document.fonts.check` alone passes when no
 * face matches at all, so each family is also proven by a loaded FontFace and a same-origin
 * woff2 response.
 */

/** Every route in the navigation map, so a page drawn later is covered the day it lands. */
const PAGES = [
  ...new Set(navPages.map(({ route }) => pathOf(route))),
  // The Sonora gallery (web/e2e/gallery.spec.ts): every component, so every glyph and face.
  '/gallery.html',
];
const FAMILIES = [
  { family: 'Inter', load: '16px Inter', file: /\/inter-latin[^/]*\.woff2$/ },
  { family: 'Archivo', load: '600 16px Archivo', file: /\/archivo-latin[^/]*\.woff2$/ },
  {
    family: 'Material Symbols Rounded',
    load: '24px "Material Symbols Rounded"',
    file: /\/material-symbols-rounded[^/]*\.woff2$/,
  },
];

/** Every request and response the page makes from here on. */
function record(page: Page) {
  const requests: string[] = [];
  const responses: { url: string; status: number }[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('response', (r) => responses.push({ url: r.url(), status: r.status() }));
  return { requests, responses };
}

for (const path of PAGES) {
  test(`[M0.tokens/b] ${path} makes every request to the server's own origin`, async ({
    page,
    baseURL,
  }) => {
    const { requests } = record(page);
    await page.goto(path, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const origin = new URL(baseURL ?? page.url()).origin;
    expect(requests.length).toBeGreaterThan(0);
    expect(
      requests.filter((url) => !url.startsWith('data:') && new URL(url).origin !== origin),
    ).toEqual([]);
  });
}

test('[M0.tokens/b] Inter, Archivo and Material Symbols Rounded load as same-origin woff2', async ({
  page,
  baseURL,
}) => {
  const { responses } = record(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  const origin = new URL(baseURL ?? page.url()).origin;

  const loaded = await page.evaluate(
    (loads) =>
      Promise.all(
        loads.map(async (l) =>
          (await document.fonts.load(l)).filter((f) => f.status === 'loaded').map((f) => f.family),
        ),
      ),
    FAMILIES.map((f) => f.load),
  );

  FAMILIES.forEach(({ family, file }, i) => {
    expect(
      loaded[i]?.map((f) => f.replace(/"/g, '')),
      `${family} has a loaded FontFace`,
    ).toContain(family);
    const served = responses.filter((r) => file.test(new URL(r.url).pathname));
    expect(served.length, `${family} came as a woff2 response`).toBeGreaterThan(0);
    for (const r of served) {
      expect(new URL(r.url).origin).toBe(origin);
      expect(r.status).toBe(200);
    }
  });
});

test('[M0.tokens/b] body text is Inter and headings are Archivo, each drawn from a loaded face', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const first = (family: string) => family.split(',')[0]?.replace(/['"]/g, '').trim();
  const body = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  const heading = await page
    .getByText('Jump back in', { exact: true })
    .evaluate((el) => getComputedStyle(el).fontFamily);
  expect(first(body)).toBe('Inter');
  expect(first(heading)).toBe('Archivo');
  // Loaded because the page uses them, not because the test asked.
  const loaded = await page.evaluate(() =>
    [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')),
  );
  expect(loaded).toEqual(expect.arrayContaining(['Inter', 'Archivo', 'Material Symbols Rounded']));
});

test('[M0.tokens/b] an icon draws as one glyph, not as its name in letters', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const glyph = page.getByText('arrow_forward', { exact: true }).first();
  const { width, fontSize, family } = await glyph.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const style = getComputedStyle(el);
    return {
      width: range.getBoundingClientRect().width,
      fontSize: parseFloat(style.fontSize),
      family: style.fontFamily,
    };
  });
  expect(family).toContain('Material Symbols Rounded');
  // The ligature is one square glyph; the word "arrow_forward" in a text face is about 6em wide.
  expect(width).toBeGreaterThan(0);
  expect(width).toBeLessThanOrEqual(fontSize * 1.25);
});
