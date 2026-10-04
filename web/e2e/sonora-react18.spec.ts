import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * Sonora's components as its showcase cards and the design runtime run them: built into the
 * local card bundle and drawn by React 18, which differs from the app's React 19 in which props
 * it passes to the page. The page is served from the repo on a made-up origin.
 */
const SONORA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'design', 'sonora');
const ORIGIN = 'http://sonora.cards';

/** The React 18 builds every card loads, from the card renderer's local copy when it has one. */
const REACT = [
  'https://unpkg.com/react@18.3.1/umd/react.development.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js',
];

const HARNESS = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="${ORIGIN}/styles.css">
<script src="${REACT[0]}"></script>
<script src="${REACT[1]}"></script>
<script src="${ORIGIN}/_ds_bundle.js"></script>
<style>html,body{margin:0;background:var(--surface-bg);color:var(--surface-fg);font-family:var(--font-body)}</style>
<div id="root"></div>`;

const TYPES: Record<string, string> = {
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};

test.beforeAll(() => {
  execFileSync('node', [join(SONORA, 'docs', 'build_bundle.js')], { stdio: 'ignore' });
});

/** Opens the harness at the given size, then renders `script`'s element, in React 18, into it. */
async function draw(page: Page, width: number, script: string) {
  await page.setViewportSize({ width, height: 600 });
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: HARNESS });
    const file = join(SONORA, decodeURIComponent(path));
    if (!existsSync(file)) return route.fulfill({ status: 404 });
    return route.fulfill({
      contentType: TYPES[extname(file)] ?? 'application/octet-stream',
      body: readFileSync(file),
    });
  });
  await page.route('https://unpkg.com/**', (route) => {
    const local = join(SONORA, '.vendor', route.request().url().split('/').pop() ?? '');
    return existsSync(local)
      ? route.fulfill({ contentType: 'application/javascript', body: readFileSync(local) })
      : route.continue();
  });
  await page.goto(`${ORIGIN}/`);
  expect(
    await page.evaluate(() => (window as never as { React: { version: string } }).React.version),
  ).toMatch(/^18\./);
  await page.evaluate(`(() => {
    const h = React.createElement;
    const DS = window.SonoraDesignSystem_6c1435;
    window.seen = [];
    ReactDOM.createRoot(document.getElementById('root')).render(${script});
  })()`);
}

test('[M0.sonoraclean/d] under React 18, Tab skips a shelf arrow hidden at its end', async ({
  page,
}) => {
  // Cards with no press take no focus, so Tab moving through the page never scrolls the row.
  const cards = Array.from(
    { length: 8 },
    (_, n) => `h(DS.MediaCard, { key: ${n}, title: 'Card ${n}', width: '160px' })`,
  ).join(', ');
  await draw(
    page,
    900,
    `h('div', { style: { padding: 40 } }, h(DS.Shelf, { platform: 'desktop' }, ${cards}))`,
  );
  const back = page.locator('button[aria-label="Scroll back"]');
  await expect(back).toHaveCount(1);
  await expect.poll(() => back.evaluate((el) => el.closest('[inert]') !== null)).toBe(true);

  const reached: string[] = [];
  await page.mouse.click(5, 5);
  for (let n = 0; n < 12; n++) {
    await page.keyboard.press('Tab');
    reached.push(
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute('aria-label') ??
          document.activeElement?.textContent?.trim().slice(0, 12) ??
          '',
      ),
    );
  }
  expect(reached, 'the forward arrow is reached').toContain('Scroll forward');
  expect(reached, 'the hidden back arrow never is').not.toContain('Scroll back');
});

for (const duration of [3600, 36000]) {
  test(`[M0.sonoraclean/d] the spoken player bar shows ${duration} s whole, clear of the slider`, async ({
    page,
  }) => {
    await draw(
      page,
      1440,
      `h(DS.MiniPlayer, { platform: 'desktop', variant: 'spoken', title: 'Chapter', artist: 'A book', progress: 1, duration: ${duration}, onSeek: () => {} })`,
    );
    const slider = page.getByRole('slider', { name: 'Seek' });
    const readouts = slider.locator('xpath=../..').locator(':scope > span');
    await expect(readouts).toHaveCount(2);
    const sliderBox = (await slider.boundingBox())!;
    for (const readout of await readouts.all()) {
      const fit = await readout.evaluate((el) => ({
        text: el.textContent,
        clipped: el.scrollWidth > el.clientWidth,
      }));
      expect(fit.clipped, `${fit.text} is drawn whole`).toBe(false);
      const box = (await readout.boundingBox())!;
      const clear = box.x + box.width <= sliderBox.x || box.x >= sliderBox.x + sliderBox.width;
      expect(clear, `${fit.text} sits clear of the slider`).toBe(true);
    }
    await expect(readouts.first()).toHaveText(duration === 3600 ? '1:00:00' : '10:00:00');
  });
}

for (const theme of ['dark', 'light']) {
  test(`[M0.sonoraclean/d] in the ${theme} theme the desktop player bar's open area washes in the now-playing ink`, async ({
    page,
  }) => {
    await draw(
      page,
      1440,
      `h('div', { 'data-theme': '${theme}' },
        h('span', { id: 'page-ink', style: { color: 'var(--surface-fg)' } }),
        h('span', { id: 'bar-ink', style: { color: 'var(--surface-now-playing-fg)' } }),
        h(DS.MiniPlayer, { platform: 'desktop', title: 'Song', artist: 'Band', onOpen: () => {} }))`,
    );
    const ink = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((el) => getComputedStyle(el).color);
    const pageInk = await ink('#page-ink');
    const barInk = await ink('#bar-ink');
    expect(pageInk, 'the page and the bar have different inks').not.toBe(barInk);
    const wash = page
      .getByRole('button', { name: /^Open player/ })
      .locator(':scope > [data-sn-state-layer]');
    expect(await wash.evaluate((el) => getComputedStyle(el).color)).toBe(barInk);
  });
}

test('[M0.sonoraclean/d] the seek slider is named Seek and seeks live while dragged, then on release', async ({
  page,
}) => {
  await draw(
    page,
    800,
    `h('div', { style: { padding: 40, width: 600 } },
      h(DS.SeekBar, { value: 0, duration: 200, platform: 'desktop', onChange: (v) => window.seen.push(v) }))`,
  );
  const slider = page.getByRole('slider', { name: 'Seek' });
  const box = (await slider.boundingBox())!;
  const y = box.y + box.height / 2;
  const at = (share: number) => box.x + box.width * share;
  const seen = () => page.evaluate(() => (window as never as { seen: number[] }).seen);

  await page.mouse.move(at(0.2), y);
  await page.mouse.down();
  await page.mouse.move(at(0.5), y, { steps: 4 });
  const dragging = await seen();
  expect(dragging.length, 'seeks while the button is held').toBeGreaterThan(1);
  expect(dragging.at(-1)).toBeCloseTo(0.5, 1);
  await page.mouse.move(at(0.8), y, { steps: 4 });
  await page.mouse.up();
  expect((await seen()).at(-1), 'the release seeks to where it lets go').toBeCloseTo(0.8, 1);

  // Once released, a pointer passing over seeks nothing.
  const before = (await seen()).length;
  await page.mouse.move(at(0.3), y, { steps: 3 });
  expect((await seen()).length).toBe(before);
});
