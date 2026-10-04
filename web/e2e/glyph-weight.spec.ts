import { expect, test, type Locator, type Page } from '@playwright/test';
import { navPages, pathOf } from './nav-pages';

/**
 * A glyph drawn through Sonora's Icon keeps the weight it had before Icon existed: where it used
 * to follow the weight of the text around it, it still does. Read from the browser's computed
 * style, as the font draws it: the `wght` of font-variation-settings when one is set, else
 * font-weight, which a variable icon font maps onto its weight axis.
 */

const effective = (glyph: Locator) =>
  glyph.evaluate((el) => {
    const s = getComputedStyle(el);
    const set = /["']wght["']\s+([\d.]+)/.exec(s.fontVariationSettings);
    return Number(set ? set[1] : s.fontWeight);
  });

/** Every glyph spelled `name` inside `scope`, at least one. */
async function weights(scope: Locator, name: string) {
  const glyphs = await scope.locator('span', { hasText: new RegExp(`^${name}$`) }).all();
  expect(glyphs.length, `${name} is drawn`).toBeGreaterThan(0);
  return Promise.all(glyphs.map(effective));
}

async function open(page: Page, path: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
}

/** Gallery section, glyph, and the weight of the text it sits in. */
const GALLERY: [string, string, number][] = [
  ['QueueRow', 'drag_handle', 500],
  ['EditableList', 'drag_handle', 500],
  ['ScrollArea', 'drag_handle', 500],
  ['PlayerSubPage', 'drag_handle', 500],
  ['SearchField', 'search', 500],
  ['Button', 'play_arrow', 600],
  ['MediaHeader', 'play_arrow', 600],
];

test('[M0.sonoraclean/d] a glyph set in text keeps the weight of the text around it', async ({
  page,
}) => {
  await open(page, '/gallery.html');
  for (const [component, glyph, weight] of GALLERY) {
    const section = page.locator(`section[data-component="${component}"]`);
    expect(new Set(await weights(section, glyph)), `${component} ${glyph}`).toEqual(
      new Set([weight]),
    );
  }
});

/** Page, MediaHeader button, its glyph: each drawn at the button label's medium weight, 600. */
const HEADER_BUTTONS: [string, string, string][] = [
  ['book', 'Resume', 'play_arrow'],
  ['book', 'Play next', 'arrow_top_right'],
  ['album', 'Play', 'play_arrow'],
  ['album', 'Add to queue', 'last_page'],
];

test("[M0.sonoraclean/d] a MediaHeader button's glyph keeps the weight of its label", async ({
  page,
}) => {
  for (const [id, label, glyph] of HEADER_BUTTONS) {
    await open(page, pathOf(navPages.find((p) => p.id === id)!.route));
    const button = page.getByRole('button', { name: label, exact: true }).first();
    expect(new Set(await weights(button, glyph)), `${id} ${label}`).toEqual(new Set([600]));
  }
});

test("[M0.sonoraclean/d] the queue's hand-off and waiting marks draw their glyphs at the label's strong weight", async ({
  page,
}) => {
  await open(page, pathOf(navPages.find((p) => p.id === 'queue')!.route));
  for (const glyph of ['swap_horiz', 'pause_circle'])
    expect(new Set(await weights(page.locator('body'), glyph)), glyph).toEqual(new Set([700]));
});
