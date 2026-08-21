/**
 * Ground truth for `components/layout/backdrop-lift.card.html`.
 *
 * A 1px line at 8% opacity cannot be settled by looking at a PNG: 8% white on #141414 composites
 * to roughly #272727, a delta of about 19 — barely more than the #141414/#080808 tonal step the
 * treatment is meant to sharpen. So this reads the actual rendered pixels: for each candidate, a
 * vertical strip through the middle of the front layer's top edge, in both themes.
 *
 *   node docs/lift_probe.mjs
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const { mkdirSync } = await import('node:fs');
mkdirSync(path.join(ROOT, '.render'), { recursive: true });
const PORT = 8947;

function loadPlaywright() {
  for (const c of ['playwright', '/home/sofiapata/src/auralis-src/node_modules/playwright', '/home/sofiapata/src/auralis-src/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright']) {
    try { return require(c); } catch { /* next */ }
  }
  throw new Error('playwright not resolvable');
}

// The PNG is decoded by handing it back to the browser as a data URL and reading it through a
// canvas, rather than by hand: a hand-rolled unfilter that is subtly wrong produces plausible
// numbers, which is the one failure mode this probe exists to avoid.
// Declares UTF-8, the way the render harness does. `python3 -m http.server` serves .html with no
// charset, a browser falls back to Latin-1, and every bullet in the card comes back as mojibake —
// which in a crop meant for judging a 1px line looks like a card bug and is entirely the probe's.
const server = spawn('python3', ['-c', `
import http.server
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.html': 'text/html; charset=utf-8',
                      '.css': 'text/css; charset=utf-8',
                      '.js': 'application/javascript; charset=utf-8'}
    def log_message(self, *a): pass
http.server.HTTPServer(('127.0.0.1', ${PORT}), H).serve_forever()
`], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
// Same vendored-CDN trick the render harness uses: the card's script tags carry SRI hashes, so
// the bytes must be the pinned ones, but they need not come over the network.
const { readFileSync, existsSync } = await import('node:fs');
await page.route('https://unpkg.com/**', (route) => {
  const f = path.join(ROOT, '.vendor', route.request().url().split('/').pop());
  return existsSync(f) ? route.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(f) }) : route.continue();
});
await page.goto(`http://127.0.0.1:${PORT}/components/layout/backdrop-lift.card.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => (document.getElementById('root') || {}).childElementCount > 0, { timeout: 8000 });
await page.waitForTimeout(400);

// The front layer's own div is found by the corner it is the only thing in the specimen to have:
// --radius-lg on the top-left. Nothing else in the cell rounds to 32px.
const spots = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('[data-probe]')) {
    const theme = el.closest('[data-theme]').getAttribute('data-theme');
    let fl = null;
    for (const n of el.querySelectorAll('*')) {
      if (getComputedStyle(n).borderTopLeftRadius === '32px') { fl = n; break; }
    }
    if (!fl) continue;
    const a = el.getBoundingClientRect(), b = fl.getBoundingClientRect();
    out.push({ key: theme + '/' + el.dataset.probe, x: Math.round(b.left + b.width / 2), top: Math.round(b.top), backY: Math.round(a.top + 8) });
  }
  return out;
});

const png = (await page.screenshot({ fullPage: true })).toString('base64');
const readings = await page.evaluate(async ({ png, spots }) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + png;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const hex = (x, y) => {
    const d = ctx.getImageData(x, y, 1, 1).data;
    return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
  };
  const num = (x, y) => { const d = ctx.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
  return spots.map((s) => {
    const rows = [];
    for (let dy = -6; dy <= 4; dy++) rows.push((dy < 0 ? '' : '+') + dy + ' ' + hex(s.x, s.top + dy));
    const edge = num(s.x, s.top), above = num(s.x, s.top - 2);
    return {
      key: s.key,
      back: hex(s.x, s.backY),
      above: hex(s.x, s.top - 2),
      edge: hex(s.x, s.top),
      step: Math.max(...[0, 1, 2].map((i) => Math.abs(edge[i] - above[i]))),
      rows: rows.join('  '),
    };
  });
}, { png, spots });

for (const r of readings) {
  console.log(r.key.padEnd(18), '| back ' + r.back, '| above ' + r.above, '| edge ' + r.edge, '| step', String(r.step).padStart(3), '|', r.rows);
}

/* A band across all five specimens at the boundary itself, at 3x device pixels — the numbers say
   what each treatment does, this says what it looks like doing it. Written per theme so the two
   can be put side by side. */
/* A second page, at 3x device pixels. The numeric pass above must stay at 1x — one CSS pixel has
   to be one screenshot pixel or "the line reads #262626" means nothing — so the magnification
   happens on its own page rather than by rescaling the one that was measured. */
const hi = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 3 });
await hi.route('https://unpkg.com/**', (route) => {
  const f = path.join(ROOT, '.vendor', route.request().url().split('/').pop());
  return existsSync(f) ? route.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(f) }) : route.continue();
});
await hi.goto(`http://127.0.0.1:${PORT}/components/layout/backdrop-lift.card.html`, { waitUntil: 'networkidle' });
await hi.waitForFunction(() => (document.getElementById('root') || {}).childElementCount > 0, { timeout: 8000 });
await hi.waitForTimeout(400);
for (const theme of ['dark', 'light']) {
  const box = await hi.evaluate((t) => {
    const els = [...document.querySelectorAll('[data-probe]')].filter((e) => e.closest('[data-theme]').getAttribute('data-theme') === t);
    const fl = (e) => [...e.querySelectorAll('*')].find((n) => getComputedStyle(n).borderTopLeftRadius === '32px');
    const a = els[0].getBoundingClientRect(), z = els[els.length - 1].getBoundingClientRect();
    return { x: a.left - 4, y: fl(els[0]).getBoundingClientRect().top - 22, width: z.right - a.left + 8, height: 52 };
  }, theme);
  await hi.screenshot({ path: path.join(ROOT, '.render', 'lift-edge-' + theme + '.png'), clip: box });
}

await browser.close();
server.kill();
