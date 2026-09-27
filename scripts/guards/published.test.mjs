/**
 * The merge check: every published source matches the tree design/published.json recorded.
 * Run: node --test scripts/guards/published.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { edit, git, read, removeTree, write } from '../plan/testing.mjs';
import { HOOKS_DIR, publishedRepo } from './testing.mjs';
import { publishedDrift, readChecked } from './published.mjs';

const cli = (root, ...args) =>
  spawnSync(process.execPath, [join(HOOKS_DIR, 'published.mjs'), '--root', root, ...args], {
    encoding: 'utf8',
  });

const commitAll = (root, message) => {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', message, '-m', 'Plan: M0.aa');
};

const PLAN_SECTION = 'docs/plan/00-intro.md';

function withRepo(checked, fn) {
  const { root } = publishedRepo({ checked });
  try {
    fn(root);
  } finally {
    removeTree(root);
  }
}

const brief = (drift) =>
  drift.map(({ artifact, source, reason }) => ({ artifact, source, reason }));

test('[M0.uikit/c] the merge check passes when every published source matches its recorded tree', () => {
  withRepo(['plan', 'sonora'], (root) => {
    assert.deepEqual(publishedDrift({ root }), []);
    const run = cli(root);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Published sources match design\/published\.json: plan, sonora/);
  });
});

test('[M0.uikit/c] the merge check fails when design/ changed after the recorded publish', () => {
  withRepo(['plan', 'sonora'], (root) => {
    write(root, 'design/sonora/README.md', '# Sonora, changed\n');
    commitAll(root, 'Change Sonora');
    assert.deepEqual(brief(publishedDrift({ root })), [
      { artifact: 'sonora', source: 'design/sonora', reason: 'changed since the publish' },
    ]);
    const run = cli(root);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /design\/sonora \(sonora\): changed since the publish/);
    assert.match(run.stderr, /Render and publish/);
  });
});

test('[M0.uikit/c] the merge check fails when docs/plan changed after the recorded publish', () => {
  withRepo(['plan', 'sonora'], (root) => {
    edit(root, PLAN_SECTION, (t) => t + '\nOne more sentence.\n');
    commitAll(root, 'Change the plan');
    assert.deepEqual(brief(publishedDrift({ root })), [
      { artifact: 'plan', source: 'docs/plan', reason: 'changed since the publish' },
    ]);
    assert.equal(cli(root).status, 1);
  });
});

test('[M0.uikit/c] a checked source with no recorded publish fails as never published', () => {
  withRepo(['plan', 'canvas'], (root) => {
    const published = JSON.parse(read(root, 'design/published.json'));
    delete published.canvas;
    write(root, 'design/published.json', JSON.stringify(published));
    commitAll(root, 'Drop the canvas record');
    const drift = publishedDrift({ root });
    assert.deepEqual(brief(drift), [
      { artifact: 'canvas', source: 'design/app', reason: 'never published' },
    ]);
    assert.equal(drift[0].recorded, null);
  });
});

test('a source the config does not check is ignored', () => {
  withRepo(['plan'], (root) => {
    write(root, 'design/app/nav.json', '{"tabs":["home"]}\n');
    commitAll(root, 'Change the canvas');
    assert.deepEqual(publishedDrift({ root }), []);
  });
});

test('an uncommitted change counts only in working-tree mode', () => {
  withRepo(['plan', 'sonora'], (root) => {
    const staged = () => git(root, 'diff', '--cached', '--name-only');
    edit(root, PLAN_SECTION, (t) => t + '\nNot committed yet.\n');
    assert.deepEqual(publishedDrift({ root }), []);
    assert.deepEqual(brief(publishedDrift({ root, worktree: true })), [
      { artifact: 'plan', source: 'docs/plan', reason: 'uncommitted changes since the publish' },
    ]);
    assert.equal(staged(), '');
    git(root, 'checkout', '--', 'docs/plan');
    write(root, 'docs/plan/99-new.md', '# New\n');
    assert.equal(publishedDrift({ root, worktree: true }).length, 1);
    assert.equal(staged(), '');
    rmSync(join(root, 'docs/plan/99-new.md'));
    assert.deepEqual(publishedDrift({ root, worktree: true }), []);
    assert.equal(staged(), '');
  });
});

test('an unknown artifact in the config is an error', () => {
  withRepo(['plan'], (root) => {
    write(root, 'scripts/guards/published-sources.json', '{"checked":["nope"]}\n');
    assert.throws(() => readChecked(root), /unknown artifact "nope"/);
    assert.equal(cli(root).status, 2);
  });
});
