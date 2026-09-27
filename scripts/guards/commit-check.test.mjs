/**
 * The Plan: line rules: the commit-msg hook on a real commit, and the CI check over a push.
 * Run: node --test scripts/guards/commit-check.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { git, removeTree } from '../plan/testing.mjs';
import { HOOKS_DIR, commitRepo, commitWith } from './testing.mjs';
import { checkMessage } from './commit-check.mjs';

const ZERO = '0'.repeat(40);
const IDS = new Set(['M0.aa', 'M0.bb']);

function withRepo(fn) {
  const repo = commitRepo();
  try {
    fn(repo.root);
  } finally {
    removeTree(repo.root);
    removeTree(repo.hooks);
  }
}

const head = (root) => git(root, 'rev-parse', 'HEAD');

const ci = (root, ...args) =>
  spawnSync(process.execPath, [join(HOOKS_DIR, 'commit-check.mjs'), '--root', root, ...args], {
    encoding: 'utf8',
  });

const results = (stdout) => stdout.split('\n').filter((l) => /^(ok|FAIL) /.test(l));

test('[M0.uikit/d] the commit-msg hook rejects an app change without a Plan: line', () => {
  withRepo((root) => {
    const before = head(root);
    const run = commitWith(root, { 'web/src/app.ts': 'export {};\n' }, 'Add the app shell\n');
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /needs a "Plan: <item id>" line/);
    assert.equal(head(root), before);
  });
});

test('[M0.uikit/d] the commit-msg hook rejects a Plan: line naming no existing item', () => {
  withRepo((root) => {
    const run = commitWith(root, { 'server/index.ts': 'x\n' }, 'Serve\n\nPlan: M0.nope\n');
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /Plan: M0\.nope names no item/);
  });
});

test('[M0.uikit/d] the commit-msg hook accepts an app change naming an existing item', () => {
  withRepo((root) => {
    const before = head(root);
    const run = commitWith(root, { 'design/sonora/x.md': 'x\n' }, 'Sonora note\n\nPlan: M0.bb\n');
    assert.equal(run.status, 0, run.stderr);
    assert.notEqual(head(root), before);
  });
});

test('[M0.uikit/d] Plan: none is refused for an app change and accepted for a tooling change', () => {
  withRepo((root) => {
    const app = commitWith(root, { 'schema/user.ts': 'x\n' }, 'User\n\nPlan: none\n');
    assert.notEqual(app.status, 0);
    assert.match(app.stderr, /Plan: none is only for commits that touch no app path/);
    git(root, 'reset', '-q');
    const tool = commitWith(root, { 'scripts/tool.mjs': 'x\n' }, 'Tool\n\nPlan: none\n');
    assert.equal(tool.status, 0, tool.stderr);
  });
});

test('a tooling-only commit needs no Plan: line', () => {
  withRepo((root) => {
    const run = commitWith(
      root,
      { '.github/workflows/x.yml': 'on: push\n', 'docs/inbox/idea.md': 'An idea.\n' },
      'Tooling and an idea\n',
    );
    assert.equal(run.status, 0, run.stderr);
  });
});

test('[M0.uikit/d] the commit-msg hook accepts a clean merge with no Plan: line', () => {
  withRepo((root) => {
    git(root, 'checkout', '-q', '-b', 'side');
    assert.equal(commitWith(root, { 'web/side.ts': 'x\n' }, 'Side\n\nPlan: M0.aa\n').status, 0);
    git(root, 'checkout', '-q', 'main');
    git(root, 'merge', '-q', '--no-ff', '-m', 'Merge side', 'side');
    assert.equal(git(root, 'log', '-1', '--format=%s'), 'Merge side');
  });
});

/** main and side both edit server/x.ts, and main merges side, stopping on the conflict. */
function conflictedMerge(root) {
  commitWith(root, { 'server/x.ts': 'base\n' }, 'Base\n\nPlan: M0.aa\n');
  git(root, 'checkout', '-q', '-b', 'side');
  commitWith(root, { 'server/x.ts': 'side\n' }, 'Side\n\nPlan: M0.aa\n');
  git(root, 'checkout', '-q', 'main');
  commitWith(root, { 'server/x.ts': 'main\n' }, 'Main\n\nPlan: M0.aa\n');
  assert.throws(() => git(root, 'merge', '-q', 'side'), 'the merge stops on the conflict');
  assert.match(git(root, 'status', '--porcelain'), /^UU server\/x\.ts$/m);
}

test('[M0.uikit/d] the commit-msg hook rejects a merge resolution that edits server/ with no Plan: line', () => {
  withRepo((root) => {
    conflictedMerge(root);
    const before = head(root);
    const run = commitWith(root, { 'server/x.ts': 'resolved\n' }, 'Merge side\n');
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /an app change \(server\/x\.ts\) needs a "Plan: <item id>" line/);
    assert.equal(head(root), before);
    const named = commitWith(root, {}, 'Merge side\n\nPlan: M0.aa\n');
    assert.equal(named.status, 0, named.stderr);
  });
});

test('comment lines are ignored', () => {
  const problems = checkMessage({ message: 'Fix\n# Plan: M0.aa\n', files: ['web/x.ts'], ids: IDS });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /needs a "Plan: <item id>" line/);
});

test('docs/plan counts as an app path, docs/outbox does not', () => {
  assert.equal(
    checkMessage({ message: 'Plan edit\n', files: ['docs/plan/10-x.md'], ids: IDS }).length,
    1,
  );
  assert.deepEqual(checkMessage({ message: 'Ask\n', files: ['docs/outbox/q.md'], ids: IDS }), []);
});

test('[M0.uikit/d] the CI check fails on a pushed commit whose app change has no Plan: line', () => {
  withRepo((root) => {
    commitWith(root, { 'web/early.ts': 'x\n' }, 'Early, unchecked\n', '--no-verify');
    const before = head(root);
    commitWith(root, { 'web/a.ts': 'x\n' }, 'Add a\n\nPlan: M0.aa\n');
    commitWith(root, { 'web/b.ts': 'x\n' }, 'Add b\n', '--no-verify');
    const bad = head(root).slice(0, 7);
    const run = ci(root, '--before', before, '--after', 'HEAD', '--ref', 'main');
    assert.equal(run.status, 1, run.stderr);
    const listed = results(run.stdout);
    assert.equal(listed.length, 2);
    assert.match(listed[0], /^ok [0-9a-f]{7} Add a$/);
    assert.match(listed[1], new RegExp(`^FAIL ${bad} Add b: `));
    assert.doesNotMatch(run.stdout, /Early/);
  });
});

test('the first push of a branch checks only commits not on origin/main', () => {
  withRepo((root) => {
    commitWith(root, { 'web/bad.ts': 'x\n' }, 'Bad on main\n', '--no-verify');
    git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    git(root, 'checkout', '-q', '-b', 'plan/M0.cc');
    commitWith(root, { 'web/good.ts': 'x\n' }, 'Good\n\nPlan: M0.cc\n');
    const run = ci(root, '--before', ZERO, '--after', 'HEAD', '--ref', 'plan/M0.cc');
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.match(run.stdout, /new branch: checking commits on no other remote branch/);
    assert.equal(results(run.stdout).length, 1);
  });
});

test('a force-push checks the rewritten commits, not what main already has', () => {
  withRepo((root) => {
    git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    git(root, 'checkout', '-q', '-b', 'plan/M0.cc');
    commitWith(root, { 'web/a.ts': 'x\n' }, 'Good A\n\nPlan: M0.cc\n');
    const a = head(root);
    git(root, 'reset', '-q', '--hard', 'HEAD~1');
    commitWith(root, { 'web/b.ts': 'x\n' }, 'Bad B\n', '--no-verify');
    const run = ci(root, '--before', a, '--after', 'HEAD', '--ref', 'plan/M0.cc');
    assert.equal(run.status, 1);
    assert.deepEqual(
      results(run.stdout).map((l) => l.split(':')[0]),
      [`FAIL ${head(root).slice(0, 7)} Bad B`],
    );
  });
});

test('[M0.uikit/d] a multi-commit first push checks every commit no other remote branch has', () => {
  withRepo((root) => {
    git(root, 'update-ref', 'refs/remotes/origin/plan/M0.aa', 'HEAD');
    git(root, 'checkout', '-q', '-b', 'plan/M0.cc');
    commitWith(root, { 'web/one.ts': 'x\n' }, 'One\n\nPlan: M0.cc\n');
    commitWith(root, { 'web/two.ts': 'x\n' }, 'Two unnamed\n', '--no-verify');
    commitWith(root, { 'web/three.ts': 'x\n' }, 'Three\n\nPlan: M0.cc\n');
    git(root, 'update-ref', 'refs/remotes/origin/plan/M0.cc', 'HEAD');
    const run = ci(root, '--before', ZERO, '--after', 'HEAD', '--ref', 'plan/M0.cc');
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.deepEqual(
      results(run.stdout).map((l) => l.replace(/ [0-9a-f]{7} /, ' ').split(':')[0]),
      ['ok One', 'FAIL Two unnamed', 'ok Three'],
    );
  });
});

test('[M0.uikit/d] a force-push from an unknown tip catches an earlier bad commit, not just the tip', () => {
  withRepo((root) => {
    git(root, 'update-ref', 'refs/remotes/origin/plan/M0.aa', 'HEAD');
    commitWith(root, { 'web/bad.ts': 'x\n' }, 'Bad early\n', '--no-verify');
    commitWith(root, { 'web/good.ts': 'x\n' }, 'Good tip\n\nPlan: M0.aa\n');
    git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    const run = ci(root, '--before', 'f'.repeat(40), '--after', 'HEAD', '--ref', 'main');
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(run.stdout, /unknown previous tip: checking commits on no other remote branch/);
    assert.deepEqual(
      results(run.stdout).map((l) => l.replace(/ [0-9a-f]{7} /, ' ').split(':')[0]),
      ['FAIL Bad early', 'ok Good tip'],
    );
  });
});

test('an unknown tip with nothing beyond the other remote branches checks the tip only', () => {
  withRepo((root) => {
    git(root, 'update-ref', 'refs/remotes/origin/plan/M0.aa', 'HEAD');
    const run = ci(root, '--before', ZERO, '--after', 'HEAD', '--ref', 'main');
    assert.match(run.stdout, /checking [0-9a-f]{7} only/);
    assert.equal(results(run.stdout).length, 1);
  });
});

test('[M0.uikit/d] the CI check passes a clean merge and fails a resolution editing server/ with no Plan: line', () => {
  withRepo((root) => {
    const before = head(root);
    git(root, 'checkout', '-q', '-b', 'clean');
    commitWith(root, { 'web/side.ts': 'x\n' }, 'Side\n\nPlan: M0.aa\n');
    git(root, 'checkout', '-q', 'main');
    commitWith(root, { 'web/main.ts': 'x\n' }, 'Main\n\nPlan: M0.aa\n');
    git(root, 'merge', '-q', '--no-ff', '--no-verify', '-m', 'Clean merge', 'clean');
    const clean = ci(root, '--before', before, '--after', 'HEAD', '--ref', 'main');
    assert.equal(clean.status, 0, clean.stdout + clean.stderr);
    assert.match(clean.stdout, /^ok [0-9a-f]{7} Clean merge$/m);

    const mid = head(root);
    conflictedMerge(root);
    commitWith(root, { 'server/x.ts': 'resolved\n' }, 'Resolved merge\n', '--no-verify');
    const bad = ci(root, '--before', mid, '--after', 'HEAD', '--ref', 'main');
    assert.equal(bad.status, 1, bad.stdout + bad.stderr);
    assert.match(bad.stdout, /^FAIL [0-9a-f]{7} Resolved merge: an app change \(server\/x\.ts\)/m);
  });
});

test('merge commits and foreign history are skipped', () => {
  withRepo((root) => {
    const before = head(root);
    git(root, 'checkout', '-q', '--orphan', 'vendor');
    git(root, 'rm', '-rfq', '.');
    commitWith(root, { 'web/vendored.js': 'x\n' }, 'Vendored\n', '--no-verify');
    git(root, 'checkout', '-q', 'main');
    git(
      root,
      'merge',
      '-q',
      '--no-verify',
      '--allow-unrelated-histories',
      '--no-edit',
      '-m',
      'Merge vendor',
      'vendor',
    );
    const run = ci(root, '--before', before, '--after', 'HEAD', '--ref', 'main');
    assert.equal(run.status, 0, run.stdout + run.stderr);
    assert.doesNotMatch(run.stdout, /FAIL/);
  });
});

test('a deleted branch push checks nothing', () => {
  withRepo((root) => {
    const run = ci(root, '--before', head(root), '--after', ZERO, '--ref', 'plan/M0.cc');
    assert.equal(run.status, 0);
    assert.match(run.stdout, /nothing pushed/);
  });
});
