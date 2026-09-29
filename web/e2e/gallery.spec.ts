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
