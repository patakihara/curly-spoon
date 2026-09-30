/**
 * `pnpm canvas:build`: the Auralis canvas artifact built from design/app, installing Sonora from
 * build/sonora. Run: node --test scripts/canvas/build.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sourcesTree } from '../plan/record-publish.mjs';
import { REPO_ROOT, removeTree, write } from '../plan/testing.mjs';

const TSX = join(REPO_ROOT, 'node_modules/.bin/tsx');
const DS = 'project/ds/sonoradesignsystem_6c1435';

/** A stand-in build/sonora: the four files the canvas installs, and its stamp. */
function sonoraBuild(stamp) {
  const dir = mkdtempSync(join(tmpdir(), 'canvas-sonora-'));
  write(dir, 'project/tokens.json', '{"name":"Sonora"}\n');
  write(dir, 'project/components/bundle.js', '/* bundle */\n');
  write(dir, 'project/components/bundle.css', '/* css */\n');
  write(dir, 'canvas/tokens.css', ':root{}\n');
  if (stamp) write(dir, 'stamp.json', JSON.stringify(stamp));
  return dir;
}

const build = (...args) =>
  spawnSync(TSX, [join(REPO_ROOT, 'scripts/canvas/build.mjs'), ...args], { encoding: 'utf8' });

test('[M0.canvas/f] the canvas build puts the flowchart and screen list on the start page, each nav.json page on a canvas page of its own, and installs Sonora beside them', () => {
  const sonora = sonoraBuild(null);
  const out = mkdtempSync(join(tmpdir(), 'canvas-build-'));
  try {
    const run = build('--sonora', sonora, '--out', out, '--draft');
    assert.equal(run.status, 0, run.stderr);
    const pages = readdirSync(join(REPO_ROOT, 'design/app/pages')).map((f) => f.split('.')[0]);
    const index = JSON.parse(readFileSync(join(out, 'project/canvas.json'), 'utf8'));
    for (const id of pages) {
      for (const board of ['phone', 'desktop']) {
        const name = `${id}.${board}.dc.html`;
        assert.ok(existsSync(join(out, 'project', name)), `${name} is drawn`);
        assert.ok(index.boards[name], `${name} is on the canvas`);
      }
    }
    const nav = JSON.parse(readFileSync(join(REPO_ROOT, 'design/app/nav.json'), 'utf8'));
    const flows = readFileSync(join(out, 'project/flows.dc.html'), 'utf8');
    const screens = readFileSync(join(out, 'project/screens.dc.html'), 'utf8');
    assert.deepEqual(
      new Set(index.pages.map((p) => p.id)),
      new Set(['start', ...nav.pages.map((p) => p.id)]),
    );
    assert.equal(index.pages[0].id, 'start');
    assert.equal(index.pages.length, nav.pages.length + 1);
    assert.ok(index.pages.length <= 40, 'the Design type holds at most 40 pages');
    assert.deepEqual(index.launch, { view: 'canvas', page: 'start' });
    assert.deepEqual(index.order.slice(0, 2), ['flows.dc.html', 'screens.dc.html']);
    assert.deepEqual(
      Object.keys(index.boards).filter((n) => index.boards[n].page === 'start'),
      ['flows.dc.html', 'screens.dc.html'],
    );
    assert.ok(!existsSync(join(out, 'project/structure.dc.html')), 'no single structure board');
    for (const page of nav.pages) {
      assert.ok(flows.includes(`>${page.title}</text>`), `${page.id} is on the flowchart`);
      const name = `${page.id}.structure.dc.html`;
      assert.ok(screens.includes(`href="${name}"`), `${page.id} is in the screen list`);
      assert.equal(index.boards[name]?.page, page.id, `${name} is on its own page`);
      const structure = readFileSync(join(out, 'project', name), 'utf8');
      assert.ok(structure.includes(`>${page.title}</h3>`), `${page.id} has its structure`);
      assert.ok(structure.includes('href="screens.dc.html"'), `${name} links to the start page`);
      for (const link of page.structure.links)
        assert.ok(structure.includes(`href="${link}.structure.dc.html"`), `${name} to ${link}`);
    }
    for (const id of pages)
      for (const board of ['phone', 'desktop'])
        assert.equal(index.boards[`${id}.${board}.dc.html`].page, id, `${id} ${board} on its page`);
    for (const file of [
      'tokens.json',
      'tokens.css',
      'components/bundle.js',
      'components/bundle.css',
    ])
      assert.ok(existsSync(join(out, DS, file)), `${file} is installed`);
    assert.equal(index.designSystems[0].namespace, 'sonoradesignsystem_6c1435');
    const stamp = JSON.parse(readFileSync(join(out, 'stamp.json'), 'utf8'));
    assert.equal(stamp.tree, sourcesTree(REPO_ROOT, ['design/app', 'web/public/art']));
    assert.equal(stamp.draft, true);
    assert.ok('sonora' in stamp, 'the stamp names the Sonora it installs');
  } finally {
    removeTree(sonora);
    removeTree(out);
  }
});

test('[M0.canvas] every image an artboard references is in the built project, and only those', () => {
  const sonora = sonoraBuild(null);
  const out = mkdtempSync(join(tmpdir(), 'canvas-build-'));
  try {
    const run = build('--sonora', sonora, '--out', out, '--draft');
    assert.equal(run.status, 0, run.stderr);
    const project = join(out, 'project');
    const referenced = new Set();
    for (const board of readdirSync(project).filter((f) => f.endsWith('.dc.html'))) {
      const html = readFileSync(join(project, board), 'utf8');
      assert.doesNotMatch(html, /"\/art\//, `${board} points at no art outside the project`);
      for (const [, path] of html.matchAll(/"([^"]+\.(?:jpe?g|png|webp|avif|gif|svg))"/g)) {
        assert.ok(existsSync(join(project, path)), `${board}: ${path} is in the project`);
        referenced.add(path);
      }
    }
    assert.ok(referenced.size > 0, 'the artboards show art');
    const shipped = readdirSync(join(project, 'art')).map((f) => `art/${f}`);
    assert.deepEqual(shipped.sort(), [...referenced].sort(), 'only the art referenced ships');
  } finally {
    removeTree(sonora);
    removeTree(out);
  }
});

test('the canvas build refuses a Sonora build that is not the recorded publish', () => {
  const sonora = sonoraBuild({ commit: 'c'.repeat(40), tree: 'f'.repeat(40), draft: false });
  const out = mkdtempSync(join(tmpdir(), 'canvas-build-'));
  try {
    const run = build('--sonora', sonora, '--out', out);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /canvas:build: .*(Sonora|uncommitted)/);
    assert.ok(!existsSync(join(out, 'project')), 'nothing is built');
  } finally {
    removeTree(sonora);
    removeTree(out);
  }
});
