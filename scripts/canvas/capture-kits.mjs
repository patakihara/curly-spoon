/**
 * Captures Sonora's UI kit screens as the comparison sources `kit:<platform>/<screen>`, into
 * design/app/compare/sonora/kit-<platform>-<screen>.png. The kits load React from unpkg and
 * photos from picsum at render time, so they are captured once and the images committed.
 *
 *   node design/sonora/docs/build_bundle.js   (the kits load its _ds_bundle.js)
 *   node scripts/canvas/capture-kits.mjs [screen ...]
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, SONORA_SHOTS, launch, serve } from './lib.mjs';

const click = (name) => (scope) => scope.getByRole('button', { name, exact: true }).first().click();
/** Nav items are plain elements that show their icon glyph as text; the phone's bar comes last. */
const nav =
  (glyph, which = 'last') =>
  (scope) =>
    scope.getByText(glyph, { exact: true })[which]().dispatchEvent('click');
const firstCard = (scope) => scope.locator('img').first().click();
// The mini-player sits just above the bottom bar; its title also names a Browse card.
const openPlayer = (scope) => scope.click({ position: { x: 150, y: 760 } });

/** Each screen: the steps from a fresh load. Mobile steps run inside the dark phone. */
const SCREENS = {
  mobile: {
    browse: [],
    music: [nav('speaker')],
    books: [nav('headphones')],
    podcasts: [nav('mic')],
    search: [nav('search')],
    album: [firstCard],
    collection: [nav('arrow_forward', 'first')],
    settings: [click('Settings')],
    nowplaying: [openPlayer],
    queue: [openPlayer, click('Open up next')],
    lyrics: [openPlayer, click('Open lyrics')],
  },
  desktop: {
    browse: [],
    music: [nav('speaker', 'first')],
    books: [nav('headphones', 'first')],
    podcasts: [nav('mic', 'first')],
    search: [nav('search', 'first')],
    album: [firstCard],
    collection: [nav('arrow_forward', 'first')],
    settings: [nav('settings', 'first')],
    queue: [click('Queue')],
    lyrics: [click('Lyrics')],
  },
};

const only = new Set(process.argv.slice(2));
mkdirSync(SONORA_SHOTS, { recursive: true });
const server = await serve(join(REPO, 'design/sonora'));
const browser = await launch();
try {
  for (const [platform, screens] of Object.entries(SCREENS)) {
    for (const [screen, steps] of Object.entries(screens)) {
      const id = `${platform}/${screen}`;
      if (only.size > 0 && !only.has(id)) continue;
      const page = await browser.newPage({
        viewport:
          platform === 'mobile' ? { width: 460, height: 1800 } : { width: 1440, height: 900 },
      });
      page.on('pageerror', (e) => console.error(`${id}: ${e.message}`));
      await page.goto(`${server.origin}/ui_kits/${platform}/index.html`, {
        waitUntil: 'networkidle',
      });
      const scope = platform === 'mobile' ? page.locator('.phone[data-theme="dark"]') : page;
      await scope.locator('img').first().waitFor();
      for (const step of steps) {
        await step(scope);
        await page.waitForTimeout(700);
      }
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      const file = join(SONORA_SHOTS, `kit-${platform}-${screen}.png`);
      await scope.screenshot({ path: file, animations: 'disabled' });
      process.stdout.write(`${id} -> ${file}\n`);
      await page.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
