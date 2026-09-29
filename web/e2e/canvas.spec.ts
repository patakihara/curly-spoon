import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * Every page of the navigation map, visited in the running app with its placeholder data: its
 * title shows, and nothing broke on the way. The list comes from nav.json, as the web routes do,
 * so a page drawn later is covered the day it lands.
 */
interface NavPage {
  id: string;
  route: string;
  title: string;
  platforms?: string[];
}
const design = new URL('../../design/app/', import.meta.url);
const nav = JSON.parse(readFileSync(new URL('nav.json', design), 'utf8')) as { pages: NavPage[] };
const onWeb = (p: NavPage) => p.platforms === undefined || p.platforms.includes('web');

/** A phone and a desktop wide enough for the side panel. */
const WIDTHS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

/** What the not-found page says, and what React Router shows when a page throws. */
const NOT_FOUND = "This page doesn't exist";
const ERROR_BOUNDARY = 'Unexpected Application Error';

/** The route with each parameter given a sample value and the query dropped; `*` an unknown path. */
const pathOf = (route: string) =>
  route === '*' ? '/no-such-page' : route.replace(/\?.*$/, '').replace(/:\w+/g, 'sample');

/**
 * The heading each page shows with its placeholder data, generated from the canvas into the file
 * the emulator's CanvasNavTest reads too, so the two apps are held to the same headings.
 */
const headings = JSON.parse(
  readFileSync(new URL('../src/generated/nav/headings.json', import.meta.url), 'utf8'),
) as Record<string, string>;

const exactly = (text: string) =>
  new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');

/** Every console error and uncaught exception from here on. */
function errors(page: Page) {
  const said: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') said.push(m.text());
  });
  page.on('pageerror', (e) => said.push(e.message));
  return said;
}

test('[M0.canvas/c] nav.json lists web pages to visit', () => {
  expect(nav.pages.filter(onWeb).length).toBeGreaterThan(0);
});

for (const p of nav.pages.filter(onWeb)) {
  for (const size of WIDTHS) {
    test(`[M0.canvas/c] ${p.id} renders with its placeholder data on a ${size.name}`, async ({
      page,
    }) => {
      const said = errors(page);
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(pathOf(p.route), { waitUntil: 'networkidle' });
      await expect(
        page.getByText(exactly(headings[p.id]!)).locator('visible=true').first(),
      ).toBeVisible();
      await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
      if (p.id !== 'notFound') await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
      expect(said).toEqual([]);
    });
  }
}

for (const p of nav.pages.filter((p) => !onWeb(p))) {
  test(`[M0.canvas/c] ${p.id} is ${p.platforms?.join(' and ')} only: the web answers its route with Not found`, async ({
    page,
  }) => {
    const said = errors(page);
    await page.goto(pathOf(p.route), { waitUntil: 'networkidle' });
    await expect(page.getByText(NOT_FOUND)).toBeVisible();
    await expect(page.getByText(exactly(p.title))).toHaveCount(0);
    expect(said).toEqual([]);
  });
}
