/**
 * Render every *.card.html in a real browser and report what actually happened.
 *
 * Nothing else in this repo executes a line of JSX. A card whose `text/babel` script
 * throws still parses its @dsCard marker, so it appears in the Design System pane as an
 * empty box — which reads as "this component is broken", not "this card is broken".
 * The only way to tell the difference is to load it.
 *
 * Reports per card: page errors, console errors, #root child count, rendered text length,
 * and which names it destructured off the namespace that do not exist.
 *
 *   node docs/build_bundle.js && node docs/render_cards.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = 8931;

function loadPlaywright() {
  const candidates = [
    'playwright',
    '/home/sofiapata/src/auralis-src/node_modules/playwright',
    '/home/sofiapata/src/auralis-src/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright',
  ];
  for (const c of candidates) {
    try { return require(c); } catch { /* next */ }
  }
  throw new Error('playwright not resolvable from any known location');
}

// Every card anywhere in the mirror, not just components/ — the Reference group lives in
// reference/ and is just as capable of shipping a card that renders blank.
const SKIP = new Set(['.git', '.render', 'node_modules', 'docs', 'assets']);
const cards = [];
(function walk(dir, rel) {
  for (const f of readdirSync(dir)) {
    if (SKIP.has(f)) continue;
    const full = path.join(dir, f);
    const r = rel ? rel + '/' + f : f;
    if (statSync(full).isDirectory()) walk(full, r);
    else if (f.endsWith('.card.html')) cards.push(r);
  }
})(ROOT, '');
cards.sort();

// Served over HTTP, not file://: the pinned CDN scripts carry integrity + crossorigin,
// and a file:// origin makes those subresource-integrity checks fail for the wrong reason.
// Not `python3 -m http.server`: it serves .html as `text/html` with no charset, so a browser
// falls back to Latin-1 and every em dash and bullet in the cards renders as mojibake. That looks
// exactly like a bad card and is entirely the harness's fault, so the harness declares UTF-8.
const server = spawn('python3', ['-c', `
import http.server, functools
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.html': 'text/html; charset=utf-8',
                      '.css': 'text/css; charset=utf-8',
                      '.js': 'application/javascript; charset=utf-8'}
    def log_message(self, *a): pass
http.server.HTTPServer(('127.0.0.1', ${PORT}), H).serve_forever()
`], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

const { chromium } = loadPlaywright();
const browser = await chromium.launch();

// The cards pull React, ReactDOM and Babel from unpkg with pinned SRI hashes. Serve them from a
// local cache instead: same URL so the bytes still satisfy the hashes, but 56 cards no longer make
// 168 network requests whose timing decides whether a card renders at all.
const VENDOR = path.join(ROOT, '.vendor');
mkdirSync(VENDOR, { recursive: true });
const CDN = [
  'https://unpkg.com/react@18.3.1/umd/react.development.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js',
  'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js',
];
const vendored = new Map();
for (const url of CDN) {
  const file = path.join(VENDOR, url.split('/').pop());
  if (!existsSync(file)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('cannot vendor ' + url + ': HTTP ' + res.status);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  vendored.set(url, readFileSync(file));
}
mkdirSync(path.join(ROOT, '.render'), { recursive: true });

let bad = 0;
for (const rel of cards) {
  const src = readFileSync(path.join(ROOT, rel), 'utf8');

  // Which namespace names does this card expect, and do they exist as components?
  const m = /const\s*\{([^}]*)\}\s*=\s*window\.SonoraDesignSystem_6c1435/.exec(src);
  const wanted = m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];

  const firstLine = src.split('\n')[0];
  const marker = firstLine.startsWith('<!-- @dsCard ');
  const vp = /viewport="(\d+)x(\d+)"/.exec(firstLine);

  const page = await browser.newPage({
    viewport: { width: vp ? +vp[1] : 1200, height: vp ? +vp[2] : 800 },
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.split('\n')[0]));
  page.on('console', (c) => { if (c.type() === 'error') errors.push('console: ' + c.text().slice(0, 160)); });

  await page.route('https://unpkg.com/**', (route) => {
    const body = vendored.get(route.request().url());
    return body ? route.fulfill({ status: 200, contentType: 'application/javascript', body }) : route.continue();
  });

  // Babel transforms <script type="text/babel"> on DOMContentLoaded. If babel.min.js has not
  // executed by then, the inline script is never transformed: every asset loads, no error is
  // raised, and #root simply stays empty — indistinguishable from a genuinely broken card. So
  // force the transform, then wait for a real child rather than guessing with a fixed delay.
  const settle = async () => {
    // Wait for Babel's OWN DOMContentLoaded transform first. Calling transformScriptTags() while
    // that is still pending executes the inline script a second time, and the card's
    // ReactDOM.createRoot() then logs "already been passed to createRoot()" — a self-inflicted
    // error indistinguishable from a broken card. Only force it when Babel truly never ran.
    const filled = () => page.waitForFunction(() => {
      const r = document.getElementById('root');
      return !!r && r.childElementCount > 0;
    }, { timeout: 6000 }).then(() => true).catch(() => false);
    if (await filled()) return;
    await page.evaluate(() => {
      const r = document.getElementById('root');
      if (r && r.childElementCount === 0 && window.Babel && window.Babel.transformScriptTags) {
        window.Babel.transformScriptTags();
      }
    }).catch(() => {});
    await filled();
  };

  await page.goto(`http://127.0.0.1:${PORT}/${rel}`, { waitUntil: 'networkidle' });
  await settle();
  // One reload if it is still empty — distinguishes a transform that lost the race from a card
  // that genuinely renders nothing.
  if (await page.evaluate(() => (document.getElementById('root') || {}).childElementCount === 0)) {
    await page.reload({ waitUntil: 'networkidle' });
    await settle();
  }
  await page.waitForTimeout(250);

  const res = await page.evaluate((names) => {
    const ns = window.SonoraDesignSystem_6c1435 || {};
    const root = document.getElementById('root');
    return {
      children: root ? root.childElementCount : -1,
      text: root ? (root.innerText || '').trim().length : 0,
      missing: names.filter((n) => !ns[n]),
      themed: document.querySelectorAll('[data-theme="dark"]').length > 0
           && document.querySelectorAll('[data-theme="light"]').length > 0,
    };
  }, wanted);

  await page.screenshot({ path: path.join(ROOT, '.render', path.basename(rel) + '.png'), fullPage: true });
  await page.close();

  const problems = [];
  if (!marker) problems.push('missing @dsCard first line');
  if (res.children <= 0) problems.push('EMPTY #root');
  if (res.text < 40) problems.push('almost no rendered text (' + res.text + ' chars)');
  if (res.missing.length) problems.push('not in namespace: ' + res.missing.join(', '));
  // Only component cards owe a dark/light pair — they exist to prove a component works in both.
  // A Reference card is a screenshot beside its write-up; rendering it twice would prove nothing.
  if (!res.themed && rel.startsWith('components/')) problems.push('missing dark+light Themed() wrapper');
  problems.push(...errors);

  if (problems.length) bad++;
  console.log(`${problems.length ? 'FAIL' : ' ok '}  ${rel}  [${wanted.length} components, ${res.text} chars]`);
  for (const p of problems) console.log('        ' + p);
}

await browser.close();
server.kill();
console.log(`\n${cards.length - bad}/${cards.length} cards render cleanly`);
process.exit(bad ? 1 : 0);
