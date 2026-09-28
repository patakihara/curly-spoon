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

test('the canvas build draws every page of design/app and installs Sonora beside them', () => {
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
    for (const file of [
      'tokens.json',
      'tokens.css',
      'components/bundle.js',
      'components/bundle.css',
    ])
      assert.ok(existsSync(join(out, DS, file)), `${file} is installed`);
    assert.equal(index.designSystems[0].namespace, 'sonoradesignsystem_6c1435');
    const stamp = JSON.parse(readFileSync(join(out, 'stamp.json'), 'utf8'));
    assert.equal(stamp.tree, sourcesTree(REPO_ROOT, ['design/app']));
    assert.equal(stamp.draft, true);
    assert.ok('sonora' in stamp, 'the stamp names the Sonora it installs');
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
