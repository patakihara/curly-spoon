/**
 * `pnpm sonora:build`: the Sonora Design System artifact built from design/sonora, with the stamp
 * record-publish.mjs reads. Run: node --test scripts/sonora/build.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SOURCES, buildStamp, sourcesTree } from '../plan/record-publish.mjs';
import { REPO_ROOT, git, removeTree, write } from '../plan/testing.mjs';
import { publishedRepo } from '../guards/testing.mjs';

test('the Sonora build writes the artifact, the canvas tokens and a stamp of design/sonora', () => {
  const out = mkdtempSync(join(tmpdir(), 'sonora-build-'));
  try {
    const run = spawnSync(
      process.execPath,
      [join(REPO_ROOT, 'scripts/sonora/build.mjs'), '--out', out, '--draft'],
      { encoding: 'utf8' },
    );
    assert.equal(run.status, 0, run.stderr);
    for (const file of [
      'project/tokens.json',
      'project/README.md',
      'project/design-system.json',
      'project/components/bundle.js',
      'project/components/bundle.css',
      'project/components/Button/Button.d.ts',
      'canvas/tokens.css',
    ]) {
      assert.ok(existsSync(join(out, file)), `${file} is built`);
    }
    assert.match(
      readFileSync(join(out, 'project/components/bundle.js'), 'utf8'),
      /^\/\* @ds-bundle: \{"format":4,"namespace":"SonoraDesignSystem_6c1435"/,
    );
    const stamp = JSON.parse(readFileSync(join(out, 'stamp.json'), 'utf8'));
    assert.equal(stamp.commit, git(REPO_ROOT, 'rev-parse', 'HEAD'));
    assert.equal(stamp.tree, sourcesTree(REPO_ROOT, SOURCES.sonora));
    assert.equal(stamp.draft, true);
  } finally {
    removeTree(out);
  }
});

test('a build stamp refuses uncommitted changes to its sources unless it is a draft', () => {
  const { root } = publishedRepo({ checked: ['sonora'] });
  try {
    const clean = buildStamp({ root, artifact: 'sonora', now: new Date('2026-01-01T00:00:00Z') });
    assert.deepEqual(clean, {
      commit: git(root, 'rev-parse', 'HEAD'),
      tree: sourcesTree(root, SOURCES.sonora),
      builtAt: '2026-01-01T00:00:00.000Z',
      draft: false,
    });
    write(root, 'design/sonora/README.md', '# Sonora, not committed\n');
    assert.throws(() => buildStamp({ root, artifact: 'sonora' }), /uncommitted changes/);
    assert.equal(buildStamp({ root, artifact: 'sonora', draft: true }).draft, true);
    write(root, 'docs/plan/00-intro.md', '# Elsewhere\n');
    git(root, 'checkout', '--', 'design/sonora');
    assert.equal(buildStamp({ root, artifact: 'sonora' }).draft, false);
  } finally {
    removeTree(root);
  }
});
