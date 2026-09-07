/**
 * Real-browser check for the gallery <-> Sonora extension postMessage bridge
 * (docs/EXTENSION-PLAN.md §2 "Bridge protocol", §4 "1.2"/"1.4"; queue items 73df265,
 * ca71c0c).
 *
 * Drives docs/gallery.js's framed mode directly, the same way the Sonora extension's
 * media/webview.js would: a scratch top-level page under /tmp frames gallery.html and
 * both sends and receives 'sonora:'-prefixed postMessage traffic. media/webview.js
 * itself is a pure relay (confirmed by reading it) with nothing to unit-test beyond
 * that relay contract, so this script exercises gallery.js's own behaviour, which is
 * the part these orders actually changed.
 *
 * The sonora:feedback check below (order 1.4) never reaches docs/serve.py's
 * /_api/feedback or `bin/queue add` — this scratch page's own script intercepts every
 * 'sonora:'-prefixed postMessage before it goes anywhere, exactly as
 * media/webview.js's relay would if nothing were listening on the other end, so
 * submitting feedback here never files a real queue item or spawns a real run (the
 * plan's own "do NOT file a real queue item as verification").
 *
 * Assumes gallery.html + .claude-design-vendor/ already exist in this checkout (this
 * script only probes/starts docs/serve.py, it never runs docs/gen_gallery.py — that
 * regeneration is lib/server.js's job, not this check's).
 *
 *   ~/.local/share/node22/bin/node docs/check_bridge.mjs
 */
import { createRequire } from 'node:module';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = 8888;
const BASE = `http://127.0.0.1:${PORT}`;

function loadPlaywright() {
  for (const c of [
    'playwright',
    '/home/sofiapata/src/auralis-src/node_modules/playwright',
    '/home/sofiapata/src/auralis-src/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright',
  ]) {
    try { return require(c); } catch { /* next */ }
  }
  throw new Error('playwright not resolvable from any known location');
}

function probe(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/gallery.html', timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
    req.on('close', () => resolve(null));
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitFor(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  do {
    if ((await probe(port)) === 200) return true;
    await sleep(200);
  } while (Date.now() < deadline);
  return false;
}

const fails = [];
function ok(cond, label, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
  if (!cond) fails.push(label);
}

let spawnedServe = null;
if ((await probe(PORT)) !== 200) {
  console.log(`docs/serve.py not answering on :${PORT} — starting it (cwd=${ROOT})`);
  spawnedServe = spawn('python3', ['docs/serve.py'], { cwd: ROOT, detached: true, stdio: 'ignore' });
  spawnedServe.unref();
  const up = await waitFor(PORT, 10000);
  if (!up) {
    console.error(`docs/serve.py did not answer on :${PORT} within 10s`);
    process.exit(1);
  }
} else {
  console.log(`docs/serve.py already answering on :${PORT}`);
}

const scratchDir = mkdtempSync(path.join(os.tmpdir(), 'sonora-check-bridge-'));
const scratchFile = path.join(scratchDir, 'host.html');
writeFileSync(
  scratchFile,
  `<!doctype html><html><body style="margin:0">
<iframe id="g" src="${BASE}/gallery.html" style="width:1200px;height:800px;border:0;display:block"></iframe>
<script>
  window.__received = [];
  window.addEventListener('message', function (e) {
    if (e.data && typeof e.data.type === 'string' && e.data.type.indexOf('sonora:') === 0) {
      window.__received.push(e.data);
    }
  });
</script>
</body></html>`,
  'utf8'
);

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

try {
  // file:// on purpose: the scratch page's own origin is irrelevant to this check — what
  // matters is that it is NOT the gallery's own origin (window.parent !== window inside the
  // iframe, exactly like the Sonora webview's foreign vscode-webview:// origin), and postMessage
  // itself works across any origin pair regardless of scheme.
  await page.goto(`file://${scratchFile}`, { waitUntil: 'load' });

  const galleryFrame = page.frames().find((f) => f.url().startsWith(BASE));
  ok(!!galleryFrame, 'gallery.html loaded in the scratch iframe');
  if (!galleryFrame) throw new Error('no gallery frame — cannot continue');

  await galleryFrame.waitForSelector('.om-review-card', { timeout: 15000 });
  const cardPaths = await galleryFrame.$$eval('.om-review-card', (els) =>
    els.map((el) => el.getAttribute('data-card-path'))
  );
  ok(cardPaths.length >= 2, 'gallery has at least two cards to test with', `found ${cardPaths.length}`);
  const firstPath = cardPaths[0];
  const targetPath = cardPaths[cardPaths.length - 1]; // furthest from the top -> a real scroll is needed

  /* ---------------------------------------------------------- sonora:open on Edit click ---- */

  const frameLoc = page.frameLocator('#g');
  const firstCard = frameLoc.locator(`.om-review-card[data-card-path="${firstPath}"]`);
  await firstCard.scrollIntoViewIfNeeded();
  await firstCard.locator('.om-ds-edit-btn').click();

  await page.waitForFunction(
    () => window.__received.some((m) => m.type === 'sonora:open'),
    null,
    { timeout: 5000 }
  ).catch(() => {});
  const opens = await page.evaluate(() => window.__received.filter((m) => m.type === 'sonora:open'));
  ok(opens.length === 1, 'exactly one sonora:open message received', JSON.stringify(opens));
  ok(!!opens[0] && opens[0].path === firstPath, 'sonora:open carries the clicked card\'s path',
    `expected ${firstPath}, got ${opens[0] && opens[0].path}`);

  /* ------------------------------------------------------------- sonora:reveal scrolls ---- */

  const visibleInFrame = (sel) => galleryFrame.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const h = window.innerHeight || document.documentElement.clientHeight;
    return { top: r.top, bottom: r.bottom, visible: r.bottom > 0 && r.top < h };
  }, sel);

  const targetSel = `.om-review-card[data-card-path="${targetPath}"]`;
  const before = await visibleInFrame(targetSel);
  ok(!!before && !before.visible, 'target card starts off-screen (scroll is needed for this check)',
    JSON.stringify(before));

  await page.evaluate(({ path: p }) => {
    const iframe = document.getElementById('g');
    iframe.contentWindow.postMessage({ type: 'sonora:reveal', path: p }, '*');
  }, { path: targetPath });

  // scrollIntoView({behavior:'smooth'}) animates; poll rather than guess a fixed delay.
  let after = null;
  const deadline = Date.now() + 5000;
  do {
    after = await visibleInFrame(targetSel);
    if (after && after.visible) break;
    await page.waitForTimeout(200);
  } while (Date.now() < deadline);
  ok(!!after && after.visible, 'sonora:reveal scrolled the target card into view', JSON.stringify(after));

  /* -------------------------------------------------------- sonora:feedback (order 1.4) ---- */

  // cardPaths[1], not firstPath (ui_kits/desktop, item 5d48f18's known preview-race card) or
  // targetPath (already scrolled off-screen by the reveal check above) — a plain, uninvolved
  // card whose own preview iframe this section is about to click into.
  const fbPath = cardPaths[1];
  const fbCard = frameLoc.locator(`.om-review-card[data-card-path="${fbPath}"]`);
  await fbCard.scrollIntoViewIfNeeded();
  const fbPreviewFrame = page.frameLocator('#g').frameLocator(
    `.om-review-card[data-card-path="${fbPath}"] .om-ds-preview-mount iframe`
  );
  // enterPickMode (openBox's own call, below) needs contentDocument.body to already exist —
  // wait out the lazy iframe's own load before opening the box.
  await fbPreviewFrame.locator('body').waitFor({ state: 'attached', timeout: 15000 });

  await fbCard.locator('.om-ds-feedback-btn').click(); // openBox -> enterPickMode
  await fbPreviewFrame.locator('body *').first().click(); // the picker's own click handler -> attachElement
  await fbCard.locator('.om-ds-feedback-box textarea').fill('Playwright bridge check: make this element bigger');
  await fbCard.locator('.om-ds-submit').click(); // submitFeedback's FRAMED branch -> postToHost

  await page.waitForFunction(
    () => window.__received.some((m) => m.type === 'sonora:feedback'),
    null,
    { timeout: 5000 }
  ).catch(() => {});
  const feedbacks = await page.evaluate(() => window.__received.filter((m) => m.type === 'sonora:feedback'));
  ok(feedbacks.length === 1, 'exactly one sonora:feedback message received', JSON.stringify(feedbacks));
  const fb = feedbacks[0];
  ok(!!fb && fb.path === fbPath, 'sonora:feedback carries the submitted card\'s path',
    `expected ${fbPath}, got ${fb && fb.path}`);
  ok(!!fb && fb.text === 'Playwright bridge check: make this element bigger',
    'sonora:feedback carries the typed feedback text', JSON.stringify(fb && fb.text));
  ok(!!fb && typeof fb.element === 'string' && fb.element.indexOf('→ ') === 0,
    'sonora:feedback carries an element descriptor from the picker', JSON.stringify(fb && fb.element));

  // Not asserted: a pre-existing, unrelated rendering race in ui_kits/desktop/index.html's own
  // preview (confirmed reproducible with these same clicks against plain, unmodified, unframed
  // gallery.html — nothing this order touches) throws TypeErrors here on some runs. Logged for
  // visibility, never failed on, since asserting it away would hide a real (separate) bug behind
  // a green bridge check instead of surfacing it.
  if (pageErrors.length) {
    console.log(`(informational, not a bridge failure) ${pageErrors.length} page error(s): ` +
      pageErrors.slice(0, 3).join(' | '));
  }
} finally {
  await browser.close();
  rmSync(scratchDir, { recursive: true, force: true });
  if (spawnedServe) {
    try { process.kill(-spawnedServe.pid, 'SIGTERM'); } catch { /* already gone */ }
  }
}

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nAll checks passed.');
process.exit(fails.length ? 1 : 0);
