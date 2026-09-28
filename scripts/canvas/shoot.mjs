/**
 * Renders canvas pages for their comparisons: each page's web render at 390 and 1440 px into
 * design/app/compare/<id>/canvas-{phone,desktop}.png, every `card:` source it names into
 * design/app/compare/sonora/ if not yet there, then prints the page hash for its comparison.
 *
 *   pnpm canvas:shoot <page id> ...
 *
 * Cards load React from unpkg and read Sonora's _ds_bundle.js (design/sonora/docs/build_bundle.js).
 * A page the web app has no route for, as Android-only Downloads, is generated as the web would
 * generate it into web/src/generated/shoot/, mounted in place of the app, and removed afterwards.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pageHash, sonoraShot } from '../../design-codegen/src/compare.ts';
import { readApp } from '../../design-codegen/src/app.ts';
import { componentName, readNav, splitRoute } from '../../design-codegen/src/nav.ts';
import { generateWebPage } from '../../design-codegen/src/page-web.ts';
import { readProps } from '../../design-codegen/src/props.ts';
import { discoverComponents } from '../../design-codegen/src/sonora.ts';
import { REPO, launch, serve } from './lib.mjs';

const APP = join(REPO, 'design/app');
const SONORA = join(REPO, 'design/sonora');
const OFF_ROUTE = join(REPO, 'web/src/generated/shoot');
const SIZES = { phone: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };

const ids = process.argv.slice(2);
if (ids.length === 0) throw new Error('usage: pnpm canvas:shoot <page id> ...');
const nav = readNav(APP);
const pages = ids.map((id) => {
  const page = nav.pages.find((p) => p.id === id);
  if (page === undefined) throw new Error(`${id} is not a page in nav.json`);
  return page;
});

/** The web app's dev server, on a free port; resolves once it answers. */
async function startWeb() {
  const port = 5190 + Math.floor(Math.random() * 500);
  const child = spawn(
    join(REPO, 'web/node_modules/.bin/vite'),
    ['--port', String(port), '--strictPort'],
    { cwd: join(REPO, 'web'), stdio: 'ignore' },
  );
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(origin)).ok) return { origin, close: () => child.kill() };
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  child.kill();
  throw new Error('the web dev server did not start');
}

function cardFile(stem) {
  for (const folder of readdirSync(join(SONORA, 'components'))) {
    const rel = `components/${folder}/${stem}.card.html`;
    if (existsSync(join(SONORA, rel))) return rel;
  }
  throw new Error(`no card ${stem}.card.html in Sonora`);
}

/**
 * Writes a page with no web route as the web generator would, beside a module that mounts it in
 * a memory router; returns that module's path on the dev server.
 */
function offRoute(page) {
  const app = readApp(APP, readProps(discoverComponents(SONORA)));
  const drawn = app.pages.find((p) => p.id === page.id);
  const name = componentName(page.id);
  mkdirSync(OFF_ROUTE, { recursive: true });
  writeFileSync(
    join(OFF_ROUTE, `${name}.tsx`),
    generateWebPage(drawn.tree, page.id, drawn.placeholder, app.components, {
      nav: app.nav,
      shell: app.shell,
      page,
      now: app.now,
    }),
  );
  writeFileSync(
    join(OFF_ROUTE, `mount-${name}.ts`),
    [
      "import { createElement } from 'react';",
      "import { createRoot } from 'react-dom/client';",
      "import { MemoryRouter } from 'react-router';",
      `import Page from './${name}';`,
      '',
      'export function mount(root: HTMLElement) {',
      '  createRoot(root).render(createElement(MemoryRouter, null, createElement(Page)));',
      '}',
      '',
    ].join('\n'),
  );
  return `/src/generated/shoot/mount-${name}.ts`;
}

const browser = await launch();
const web = await startWeb();
const sonora = await serve(SONORA);
try {
  for (const page of pages) {
    for (const source of page.sources.sonora.filter((s) => s.startsWith('card:'))) {
      const file = join(APP, 'compare', sonoraShot(source));
      if (existsSync(file)) continue;
      const rel = cardFile(source.slice('card:'.length));
      const marker = readFileSync(join(SONORA, rel), 'utf8').split('\n')[0];
      const [, w = '1200', h = '800'] = /viewport="(\d+)x(\d+)"/.exec(marker) ?? [];
      const tab = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
      await tab.goto(`${sonora.origin}/${rel}`, { waitUntil: 'networkidle' });
      await tab.waitForFunction("(document.getElementById('root')?.childElementCount ?? 0) > 0");
      await tab.waitForTimeout(500);
      await tab.screenshot({ path: file, fullPage: true, animations: 'disabled' });
      await tab.close();
      process.stdout.write(`${source} -> ${file}\n`);
    }
    // A page not drawn yet has only its Sonora sources to look at.
    if (!existsSync(join(APP, 'pages', `${page.id}.page.jsx`))) continue;
    const dir = join(APP, 'compare', page.id);
    mkdirSync(dir, { recursive: true });
    const path = splitRoute(page.route).path.replace(/:([A-Za-z0-9]+)/g, 'placeholder-$1');
    for (const [name, viewport] of Object.entries(SIZES)) {
      const tab = await browser.newPage({ viewport });
      tab.on('pageerror', (e) => console.error(`${page.id} ${name}: ${e.message}`));
      tab.on(
        'console',
        (m) => m.type() === 'error' && console.error(`${page.id} ${name}: ${m.text()}`),
      );
      const mount = page.platforms.includes('web') ? undefined : offRoute(page);
      await tab.goto(web.origin + (path === '*' || mount ? '/no-such-page' : path), {
        waitUntil: 'networkidle',
      });
      if (mount !== undefined) {
        await tab.evaluate(async (url) => {
          const { mount } = await import(url);
          const root = globalThis.document.getElementById('root');
          const fresh = root.cloneNode(false);
          root.replaceWith(fresh);
          mount(fresh);
        }, mount);
        await tab.waitForLoadState('networkidle');
      }
      await tab.waitForTimeout(400);
      await tab.screenshot({ path: join(dir, `canvas-${name}.png`), animations: 'disabled' });
      await tab.close();
    }
    process.stdout.write(`${page.id}: pageHash ${pageHash(APP, SONORA, page.id)}\n`);
  }
} finally {
  rmSync(OFF_ROUTE, { recursive: true, force: true });
  await browser.close();
  web.close();
  await sonora.close();
}
