import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * The Sonora gallery page draws every Sonora component, each in its own
 * `section[data-component]`, in dark and light. One screenshot per component goes to
 * `test-results/gallery/<Name>.png`, which CI uploads as the `gallery-screenshots` artifact. There
 * is no golden image: font antialiasing differs between runners, and the plan asks only that the
 * screenshots are made.
 */
const sonora = fileURLToPath(new URL('../../design/sonora/components', import.meta.url));
const COMPONENTS = readdirSync(sonora, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .flatMap((e) => readdirSync(join(sonora, e.name)))
  .filter((f) => f.endsWith('.d.ts'))
  .map((f) => f.slice(0, -'.d.ts'.length))
  .sort();
const SHOTS = fileURLToPath(new URL('../test-results/gallery', import.meta.url));

test('[M0.tokens/c] the gallery draws every Sonora component, one screenshot each', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/gallery.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  const sections = page.locator('section[data-component]');
  const drawn = (await sections.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-component') ?? ''),
  )) as string[];
  expect([...drawn].sort(), 'one section per Sonora .d.ts').toEqual(COMPONENTS);

  mkdirSync(SHOTS, { recursive: true });
  for (const name of drawn) {
    const section = page.locator(`section[data-component="${name}"]`);
    const box = await section.boundingBox();
    expect(box?.height ?? 0, `${name} draws something`).toBeGreaterThan(0);
    await section.screenshot({ path: join(SHOTS, `${name}.png`), animations: 'disabled' });
  }
  expect(
    readdirSync(SHOTS)
      .filter((f) => f.endsWith('.png'))
      .sort(),
  ).toEqual(COMPONENTS.map((n) => `${n}.png`));
  expect(errors, 'no page or console error').toEqual([]);
});

test('[M0.tokens/c] the gallery calls no API and reads no stored user data', async ({ page }) => {
  await page.addInitScript(() => {
    const reads: string[] = [];
    (window as unknown as { __userDataReads: string[] }).__userDataReads = reads;
    for (const name of ['localStorage', 'sessionStorage', 'indexedDB'] as const) {
      const own = Object.getOwnPropertyDescriptor(window, name);
      if (own?.get !== undefined) {
        const get = own.get;
        Object.defineProperty(window, name, {
          configurable: true,
          get() {
            reads.push(name);
            return get.call(this);
          },
        });
      }
    }
    const cookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    if (cookie?.get !== undefined) {
      const get = cookie.get;
      Object.defineProperty(Document.prototype, 'cookie', {
        ...cookie,
        get() {
          reads.push('cookie');
          return get.call(this);
        },
      });
    }
  });
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/gallery.html', { waitUntil: 'networkidle' });
  await expect(page.locator('section[data-component]').first()).toBeVisible();

  const origin = new URL(page.url()).origin;
  const paths = requests.map((u) => (u.startsWith(origin) ? new URL(u).pathname : u));
  expect(
    paths.filter((p) => !p.startsWith('/')),
    'every request stays on the server',
  ).toEqual([]);
  expect(
    paths.filter((p) => p.startsWith('/api/')),
    'no API request',
  ).toEqual([]);
  expect(
    await page.evaluate(() => (window as unknown as { __userDataReads: string[] }).__userDataReads),
    'no cookie, storage or IndexedDB read',
  ).toEqual([]);
});

test("[M0.tokens/c] RailItem's active pill reads as the accent's violet in both themes", async ({
  page,
}) => {
  await page.goto('/gallery.html', { waitUntil: 'networkidle' });
  for (const theme of ['dark', 'light']) {
    const pane = page.locator(`section[data-component="RailItem"] > [data-theme="${theme}"]`);
    const hues = await pane.evaluate((el) => {
      /** A CSS colour as painted, then its OKLCH hue in degrees and chroma. */
      const paint = (css: string) => {
        const ctx = document.createElement('canvas').getContext('2d')!;
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = [...ctx.getImageData(0, 0, 1, 1).data].map((v) => {
          const c = v / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        const l = Math.cbrt(0.4122214708 * r! + 0.5363325363 * g! + 0.0514459929 * b!);
        const m = Math.cbrt(0.2119034982 * r! + 0.6806995451 * g! + 0.1073969566 * b!);
        const s = Math.cbrt(0.0883024619 * r! + 0.2817188376 * g! + 0.6299787005 * b!);
        const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
        const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
        return { hue: (Math.atan2(B, A) * 180) / Math.PI, chroma: Math.hypot(A, B) };
      };
      const pill = [...el.querySelectorAll('span')]
        .map((s) => getComputedStyle(s).backgroundColor)
        .find((c) => c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent');
      const accent = getComputedStyle(el).getPropertyValue('--accent').trim();
      return { pill: pill === undefined ? null : paint(pill), accent: paint(accent) };
    });
    expect(hues.pill, `${theme}: the active pill has a colour`).not.toBeNull();
    const apart = Math.abs(((hues.pill!.hue - hues.accent.hue + 540) % 360) - 180);
    expect(apart, `${theme}: the pill's hue is within 20° of the accent's`).toBeLessThan(20);
  }
});
