/**
 * The session-start hook: the progress summary and the artifact comment reminder in context.
 * Run: node --test scripts/guards/session-start.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
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

const start = (root, ghDir, env = {}, source = 'startup') =>
  runHook(
    'session-start.mjs',
    { hook_event_name: 'SessionStart', source, cwd: root },
    {
      env: { PATH: pathWith(ghDir), ...env },
    },
  );

const context = (run) => {
  const out = JSON.parse(run.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'SessionStart');
  return out.additionalContext.split('\n');
};

/** The progress summary's first line, after the orchestrator's reading instructions. */
const summaryLine = (lines) => lines.find((l) => l.startsWith('Auralis plan · '));

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
      summaryLine(lines),
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
      assert.match(summaryLine(context(run)), /checks unavailable: gh run list failed/);
    },
  );
});

test('[M0.uikit/e] a hanging gh is cut off within the budget and the summary shows checks unavailable', () => {
  withRepo(
    () => ({ mode: 'hang' }),
    (root, commits, ghDir) => {
      const began = Date.now();
      const run = start(root, ghDir, { AURALIS_GH_TIMEOUT_MS: '4000' });
      assert.ok(Date.now() - began < 10_000, 'the hook finishes in under 10 s');
      assert.equal(run.status, 0, run.stderr);
      const lines = context(run);
      assert.match(summaryLine(lines), /checks unavailable: gh run list timed out/);
    },
  );
});

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test('[M0.uikit/e] a hanging gh is killed, not left running after the hook returns', () => {
  withRepo(
    () => ({ mode: 'hang' }),
    (root, commits, ghDir) => {
      const run = start(root, ghDir, { AURALIS_GH_TIMEOUT_MS: '4000' });
      assert.equal(run.status, 0, run.stderr);
      const pids = readFileSync(join(ghDir, 'gh.pids'), 'utf8').split('\n').filter(Boolean);
      assert.ok(pids.length > 0, 'the fake gh ran');
      assert.deepEqual(
        pids.filter((pid) => alive(Number(pid))),
        [],
        'no gh survives',
      );
      assert.match(summaryLine(context(run)), /checks unavailable: gh run list timed out/);
    },
  );
});

for (const source of ['startup', 'compact']) {
  test(`[M0.plan/e] on ${source}, the hook first tells the orchestrator to read all of docs/plan, compactions included`, () => {
    withRepo(answering, (root, commits, ghDir) => {
      const run = start(root, ghDir, {}, source);
      assert.equal(run.status, 0, run.stderr);
      const lines = context(run);
      assert.match(
        lines[0],
        /^Orchestrator: before any other work, read every file in docs\/plan in full/,
      );
      assert.match(lines[0], /after (every|this) compaction/);
      assert.match(lines[1], /^Brief subagents with node scripts\/plan\/brief\.mjs <id>/);
      assert.match(summaryLine(lines), /^Auralis plan · current M0 Foundations/);
      assert.ok(lines.includes('Next: M0.cc: The third item.'));
      assert.match(lines.at(-1), /ArtifactComments/);
    });
  });
}

test('[M0.plan/e] after a compaction, the hook says the context was just compacted', () => {
  withRepo(answering, (root, commits, ghDir) => {
    const run = start(root, ghDir, {}, 'compact');
    assert.equal(run.status, 0, run.stderr);
    assert.match(
      context(run)[0],
      /read every file in docs\/plan in full again after this compaction/,
    );
  });
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
