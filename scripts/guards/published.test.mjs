/**
 * The merge check: every published source matches the tree design/published.json recorded.
 * Run: node --test scripts/guards/published.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, edit, git, read, removeTree, write } from '../plan/testing.mjs';
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
  drift.map(({ artifact, sources, reason }) => ({ artifact, sources, reason }));

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
      { artifact: 'sonora', sources: ['design/sonora'], reason: 'changed since the publish' },
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
      {
        artifact: 'plan',
        sources: ['docs/plan', 'docs/outbox'],
        reason: 'changed since the publish',
      },
    ]);
    assert.equal(cli(root).status, 1);
  });
});

test('[M0.uikit/c] the merge check fails when docs/outbox changed after the recorded publish', () => {
  withRepo(['plan'], (root) => {
    git(root, 'rm', '-q', 'docs/outbox/screenshots.md');
    commitAll(root, 'Answer the screenshots question');
    assert.deepEqual(brief(publishedDrift({ root })), [
      {
        artifact: 'plan',
        sources: ['docs/plan', 'docs/outbox'],
        reason: 'changed since the publish',
      },
    ]);
    const run = cli(root);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /docs\/plan, docs\/outbox \(plan\): changed since the publish/);
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
      { artifact: 'canvas', sources: ['design/app', 'web/public/art'], reason: 'never published' },
    ]);
    assert.equal(drift[0].recorded, null);
  });
});

test('the merge check fails when the art the canvas ships changed after its publish', () => {
  withRepo(['canvas'], (root) => {
    write(root, 'web/public/art/cover.jpg', 'not really a jpeg\n');
    commitAll(root, 'Change the placeholder art');
    assert.deepEqual(brief(publishedDrift({ root })), [
      {
        artifact: 'canvas',
        sources: ['design/app', 'web/public/art'],
        reason: 'changed since the publish',
      },
    ]);
  });
});

test('the merge check passes when the canvas installs the published Sonora', () => {
  withRepo(['plan', 'sonora', 'canvas'], (root) => {
    assert.deepEqual(publishedDrift({ root }), []);
  });
});

test('the merge check fails when the canvas installs a Sonora other than the published one', () => {
  withRepo(['plan', 'sonora', 'canvas'], (root) => {
    const published = JSON.parse(read(root, 'design/published.json'));
    published.sonora.version = '2-sonora';
    write(root, 'design/published.json', JSON.stringify(published));
    commitAll(root, 'Republish Sonora only');
    assert.deepEqual(brief(publishedDrift({ root })), [
      {
        artifact: 'canvas',
        sources: ['design/app', 'web/public/art'],
        reason: 'installs sonora 1-sonora, but sonora is published at 2-sonora',
      },
    ]);
    const run = cli(root);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /design\/app, web\/public\/art \(canvas\): installs sonora 1-sonora/);
  });
});

test('a canvas record that names no installed Sonora fails', () => {
  withRepo(['plan', 'sonora', 'canvas'], (root) => {
    const published = JSON.parse(read(root, 'design/published.json'));
    delete published.canvas.installs;
    write(root, 'design/published.json', JSON.stringify(published));
    commitAll(root, 'Record the canvas without its install');
    assert.deepEqual(
      publishedDrift({ root }).map((d) => d.reason),
      ['installs sonora none, but sonora is published at 1-sonora'],
    );
  });
});

test('this repo checks the plan, Sonora and the canvas', () => {
  assert.deepEqual(
    readChecked(REPO_ROOT).map((c) => c.artifact),
    ['plan', 'sonora', 'canvas'],
  );
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
      {
        artifact: 'plan',
        sources: ['docs/plan', 'docs/outbox'],
        reason: 'uncommitted changes since the publish',
      },
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
