/**
 * The session-start hook: the progress summary and the artifact comment reminder in context.
 * Run: node --test scripts/guards/session-start.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixtureRepo, git, removeTree, tag, write } from '../plan/testing.mjs';
import { fakeGh, pathWith, runHook } from './testing.mjs';

const check = (item, criterion, status) => ({
  item,
  criterion,
  name: `${tag(item, criterion)} check`,
  status,
});

function withRepo(gh, fn) {
  const { root, commits } = fixtureRepo();
  write(
    root,
    'design/published.json',
    JSON.stringify({ plan: { url: 'https://claude.ai/artifact/example' } }) + '\n',
  );
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'Record a publish');
  const ghDir = fakeGh(gh(commits));
  try {
    fn(root, commits, ghDir);
  } finally {
    removeTree(root);
    removeTree(ghDir);
  }
}

const start = (root, ghDir, env = {}) =>
  runHook(
    'session-start.mjs',
    { hook_event_name: 'SessionStart', cwd: root },
    {
      env: { PATH: pathWith(ghDir), ...env },
    },
  );

const context = (run) => {
  const out = JSON.parse(run.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'SessionStart');
  return out.additionalContext.split('\n');
};

const answering = (commits) => ({
  mode: 'answer',
  runs: [
    {
      databaseId: 21,
      headSha: commits.third,
      workflowName: 'CI',
      status: 'completed',
      conclusion: 'failure',
      createdAt: '2026-01-03T00:00:00Z',
    },
  ],
  artifacts: {
    21: [
      {
        commit: commits.third,
        workflow: 'ci',
        job: 'unit',
        tests: [
          check('M0.aa', 'a', 'passed'),
          check('M0.bb', 'a', 'passed'),
          check('M0.dd', 'a', 'failed'),
        ],
      },
    ],
  },
});

test('[M0.uikit/e] the session-start hook prints milestone, done items, work in flight, next step, failing checks and outbox', () => {
  withRepo(answering, (root, commits, ghDir) => {
    const run = start(root, ghDir);
    assert.equal(run.status, 0, run.stderr);
    const lines = context(run);
    assert.match(
      lines[0],
      new RegExp(
        `^Auralis plan · current M0 Foundations · 2/5 done · checks from CI@${commits.third.slice(0, 7)}`,
      ),
    );
    assert.ok(lines.includes('Done (2): M0.bb, M0.exit'), lines.join('\n'));
    assert.ok(lines.includes('Next: M0.cc: The third item.'));
    assert.ok(lines.includes('In flight: plan/M0.aa: "parser done; next: lint"'));
    assert.ok(lines.some((l) => l.startsWith('Failing: M0.dd (a):')));
    assert.ok(
      lines.some((l) => l.startsWith('Waiting on you (1): Screenshots in the public repo?')),
    );
    assert.match(lines.at(-1), /ArtifactComments/);
    assert.match(lines.at(-1), /plan https:\/\/claude\.ai\/artifact\/example/);
  });
});

test('[M0.uikit/e] offline, the hook still prints the summary with checks unavailable', () => {
  withRepo(
    () => ({ mode: 'fail' }),
    (root, commits, ghDir) => {
      const run = start(root, ghDir);
      assert.equal(run.status, 0, run.stderr);
      assert.match(context(run)[0], /checks unavailable: gh run list failed/);
    },
  );
});

test('[M0.uikit/e] a hanging gh is cut off and the summary comes without results', () => {
  withRepo(
    () => ({ mode: 'hang' }),
    (root, commits, ghDir) => {
      const began = Date.now();
      const run = start(root, ghDir, { AURALIS_SUMMARY_TIMEOUT_MS: '1000' });
      assert.ok(Date.now() - began < 10_000, 'the hook finishes in under 10 s');
      assert.equal(run.status, 0, run.stderr);
      const lines = context(run);
      assert.match(lines[0], /checks unavailable: not requested \(--no-results\)/);
      assert.ok(lines.includes('(CI results timed out after 1 s; shown without them)'));
    },
  );
});

test('it fails open on a payload it cannot read', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'session-start-'));
  const ghDir = fakeGh({ mode: 'fail' });
  try {
    const run = runHook('session-start.mjs', 'not json', { cwd, env: { PATH: pathWith(ghDir) } });
    assert.equal(run.status, 0);
    if (run.stdout) {
      assert.equal(JSON.parse(run.stdout).hookSpecificOutput.hookEventName, 'SessionStart');
    }
  } finally {
    removeTree(cwd);
    removeTree(ghDir);
  }
});
