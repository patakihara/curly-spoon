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
import { readFileSync, readdirSync, mkdirSync, statSync } from 'node:fs';
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

const cards = [];
for (const dir of readdirSync(path.join(ROOT, 'components'))) {
  const d = path.join(ROOT, 'components', dir);
  if (!statSync(d).isDirectory()) continue;
  for (const f of readdirSync(d)) {
    if (f.endsWith('.card.html')) cards.push('components/' + dir + '/' + f);
  }
}
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

  await page.goto(`http://127.0.0.1:${PORT}/${rel}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

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
  if (!res.themed) problems.push('missing dark+light Themed() wrapper');
  problems.push(...errors);

  if (problems.length) bad++;
  console.log(`${problems.length ? 'FAIL' : ' ok '}  ${rel}  [${wanted.length} components, ${res.text} chars]`);
  for (const p of problems) console.log('        ' + p);
}

await browser.close();
server.kill();
console.log(`\n${cards.length - bad}/${cards.length} cards render cleanly`);
process.exit(bad ? 1 : 0);
