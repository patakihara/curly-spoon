/**
 * Read a JS-rendered spec page (m2.material.io) with the Chromium that Playwright already
 * installed here. WebFetch gets an empty shell from these — the whole page is client-rendered.
 *
 *   node docs/fetch_spec.mjs <url> [outfile]
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const c of [
    'playwright',
    '/home/sofiapata/src/auralis-src/node_modules/playwright',
    '/home/sofiapata/src/auralis-src/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright',
  ]) {
    try { return require(c); } catch { /* next */ }
  }
  throw new Error('playwright not resolvable');
}

const url = process.argv[2];
const out = process.argv[3];
const { chromium } = loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(2500);

const text = await page.evaluate(() => {
  // Keep headings and figure captions: on these pages the do/don't guidance and the anatomy
  // labels live in captions, and losing them loses most of what is prescriptive.
  const root = document.querySelector('main') || document.body;
  const parts = [];
  const walk = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) {
        const t = n.textContent.replace(/\s+/g, ' ').trim();
        if (t) parts.push(t);
      } else if (n.nodeType === 1) {
        const tag = n.tagName.toLowerCase();
        if (['script', 'style', 'noscript', 'svg'].includes(tag)) continue;
        if (/^h[1-6]$/.test(tag)) parts.push('\n\n## ' + n.textContent.replace(/\s+/g, ' ').trim() + '\n');
        else if (['li'].includes(tag)) { parts.push('\n- '); walk(n); continue; }
        else if (['p', 'figcaption', 'div', 'section', 'td', 'tr'].includes(tag)) { parts.push('\n'); walk(n); continue; }
        walk(n);
      }
    }
  };
  walk(root);
  return parts.join(' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
});

console.log('chars: ' + text.length);
if (out) { writeFileSync(out, text); console.log('wrote ' + out); }
else console.log(text.slice(0, 4000));
await browser.close();
