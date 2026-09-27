/**
 * Plan progress, computed from the repo: criteria from test results and sign-off tags, items in
 * flight from plan/<ID> branches, the outbox, recent decisions and sorted ideas.
 * Run: node --test scripts/plan/progress.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeProgress, criterionStatus, formatSummary, itemStatus } from './progress.mjs';
import { fakeExec, fixtureRepo, git, removeTree, tag, write } from './testing.mjs';

const check = (item, criterion, status) => ({
  item,
  criterion,
  name: `${tag(item, criterion)} check`,
  status,
});

/** The fixture repo with one CI run at its third commit, reporting `tests`. */
function scenario(tests, { failGh = false } = {}) {
  const repo = fixtureRepo();
  const { third } = repo.commits;
  const runs = [
    {
      databaseId: 21,
      headSha: third,
      workflowName: 'CI',
      status: 'completed',
      conclusion: 'failure',
      createdAt: '2026-01-03T00:00:00Z',
    },
  ];
  const artifacts = { 21: [{ commit: third, workflow: 'ci', job: 'unit', tests }] };
  return { ...repo, exec: fakeExec({ runs, artifacts, failGh }) };
}

const DONE_LINE = 'Done (2): M0.bb, M0.exit';

const STANDARD = [
  check('M0.aa', 'a', 'passed'),
  check('M0.bb', 'a', 'passed'),
  check('M0.dd', 'a', 'failed'),
];

function progressOf(tests = STANDARD, options, change = () => {}) {
  const { root, commits, exec } = scenario(tests, options);
  try {
    change(root);
    return { progress: computeProgress({ root, results: 'ci', exec }), commits };
  } finally {
    removeTree(root);
  }
}

test('[M0.plan/c] progress.mjs --summary prints the milestone, done items, next, in-flight, failing, outbox and decision lines', () => {
  const { progress, commits } = progressOf();
  const lines = formatSummary(progress).split('\n');
  assert.ok(lines.length <= 25);
  assert.equal(
    lines[0],
    `Auralis plan · current M0 Foundations · 2/5 done · checks from CI@${commits.third.slice(0, 7)} (1 behind HEAD)`,
  );
  assert.equal(lines[1], DONE_LINE);
  assert.equal(lines[2], 'Next: M0.cc: The third item.');
  assert.equal(lines[3], 'In flight: plan/M0.aa: "parser done; next: lint"');
  assert.equal(lines[4], `Failing: M0.dd (a): ${tag('M0.dd', 'a')} check`);
  assert.equal(
    lines[5],
    'Waiting on you (1): Screenshots in the public repo? (default: They stay out of git.)',
  );
  assert.match(
    lines[6],
    /^Recent decisions: [0-9a-f]{7} Gapless is part of playback · [0-9a-f]{7} Keep the screenshots local$/,
  );
});

test('[M0.plan/c] with gh failing, the summary says checks are unavailable and nothing is done', () => {
  const { progress } = progressOf(STANDARD, { failGh: true });
  const summary = formatSummary(progress);
  assert.match(summary.split('\n')[0], /checks unavailable: gh run list failed/);
  const m0 = progress.milestones[0];
  assert.deepEqual(
    m0.items.filter((i) => !i.isExit).map((i) => i.status),
    ['open', 'open', 'open', 'open'],
  );
  assert.ok(m0.items[0].criteria.every((c) => c.status === 'unknown'));
  assert.equal(m0.items.at(-1).status, 'done', 'a sign-off still computes from its tag');
});

test('the progress CLI prints a summary without results, straight from a repo', () => {
  const { root } = fixtureRepo();
  try {
    const cli = join(dirname(fileURLToPath(import.meta.url)), 'progress.mjs');
    const out = execFileSync('node', [cli, '--summary', '--no-results', '--root', root], {
      encoding: 'utf8',
    });
    assert.match(
      out,
      /^Auralis plan · current M0 Foundations · 1\/5 done · checks unavailable: not requested/,
    );
    const json = JSON.parse(
      execFileSync('node', [cli, '--json', '--no-results', '--root', root], { encoding: 'utf8' }),
    );
    assert.equal(json.current, 'M0');
  } finally {
    removeTree(root);
  }
});

test('a criterion fails on any failed test, passes on a pass with none failed, else is missing', () => {
  const pass = { status: 'passed' };
  const fail = { status: 'failed' };
  const skip = { status: 'skipped' };
  assert.equal(criterionStatus([pass, fail], null), 'failed');
  assert.equal(criterionStatus([pass, skip], null), 'passed');
  assert.equal(criterionStatus([skip], null), 'missing');
  assert.equal(criterionStatus([], null), 'missing');
  assert.equal(criterionStatus([pass], 'offline'), 'unknown');
});

test('an item is done when every criterion passed, failing when any failed, else open', () => {
  const c = (...statuses) => statuses.map((status) => ({ status }));
  assert.equal(itemStatus(c('passed', 'passed')), 'done');
  assert.equal(itemStatus(c('passed', 'failed', 'missing')), 'failing');
  assert.equal(itemStatus(c('passed', 'missing')), 'open');
  assert.equal(itemStatus(c('unknown')), 'open');
});

test('each item carries its criteria with their status and the tests behind them', () => {
  const { progress } = progressOf();
  const aa = progress.milestones[0].items[0];
  assert.equal(aa.status, 'open');
  assert.deepEqual(
    aa.criteria.map((c) => [c.label, c.kind, c.status, c.tests]),
    [
      ['a', 'test', 'passed', [`${tag('M0.aa', 'a')} check`]],
      ['b', 'test', 'missing', []],
    ],
  );
  assert.deepEqual(progress.failing, [
    { item: 'M0.dd', criterion: 'a', tests: [`${tag('M0.dd', 'a')} check`] },
  ]);
});

test('an item is in progress while a plan/<ID> branch exists, locally or on origin', () => {
  const { progress } = progressOf(STANDARD, {}, (root) => {
    git(root, 'update-ref', 'refs/remotes/origin/plan/M0.dd-render', 'HEAD');
    git(root, 'branch', 'plan/M0.aaa');
  });
  const [aa, , , dd] = progress.milestones[0].items;
  assert.deepEqual(
    [aa.inProgress, aa.branches],
    [true, [{ name: 'plan/M0.aa', note: 'parser done; next: lint' }]],
  );
  assert.deepEqual(
    [dd.inProgress, dd.branches],
    [true, [{ name: 'plan/M0.dd-render', note: 'no note' }]],
  );
  assert.deepEqual(
    progress.inFlight.map((f) => f.branch),
    ['plan/M0.aa', 'plan/M0.dd-render'],
  );
});

test('the current milestone is the first with an item not done', () => {
  const all = ['aa/a', 'aa/b', 'bb/a', 'cc/a', 'dd/a'].map((s) =>
    check(`M0.${s.split('/')[0]}`, s.split('/')[1], 'passed'),
  );
  const { progress } = progressOf(all, {}, (root) =>
    git(root, 'tag', 'signoff/M0.dd', '-m', 'yes'),
  );
  assert.equal(progress.milestones[0].done, 5);
  assert.equal(progress.current, 'M1');
  assert.deepEqual(progress.next, { id: 'M1.play', text: 'Playback works.' });
});

test('next skips items in progress, and the exit counts only once every other item is done', () => {
  const all = ['aa/a', 'aa/b', 'bb/a', 'cc/a', 'dd/a'].map((s) =>
    check(`M0.${s.split('/')[0]}`, s.split('/')[1], 'passed'),
  );
  const { progress } = progressOf(all, {}, (root) => git(root, 'tag', '-d', 'signoff/M0.exit'));
  assert.equal(progress.next.id, 'M0.dd', 'M0.dd still waits on its sign-off');
  const withSignoff = progressOf(all, {}, (root) => {
    git(root, 'tag', '-d', 'signoff/M0.exit');
    git(root, 'tag', 'signoff/M0.dd', '-m', 'yes');
  }).progress;
  assert.equal(withSignoff.current, 'M0');
  assert.deepEqual(withSignoff.next, { id: 'M0.exit', text: 'you sign in and it works.' });
});

test('next is nothing while every item but the exit is in flight: the exit waits for them', () => {
  const { progress } = progressOf([check('M0.aa', 'a', 'passed')], {}, (root) => {
    git(root, 'tag', '-d', 'signoff/M0.exit');
    for (const id of ['bb', 'cc', 'dd']) git(root, 'branch', `plan/M0.${id}`);
  });
  const items = progress.milestones[0].items;
  assert.deepEqual(
    items.map((i) => [i.id, i.inProgress, i.status === 'done']),
    [
      ['M0.aa', true, false],
      ['M0.bb', true, false],
      ['M0.cc', true, false],
      ['M0.dd', true, false],
      ['M0.exit', false, false],
    ],
  );
  assert.equal(progress.current, 'M0');
  assert.equal(progress.next, null);
});

test('decisions are the newest Decision: lines, and sorted ideas the inbox files deleted with their Plan: line', () => {
  const { progress, commits } = progressOf();
  assert.deepEqual(
    progress.decisions.map((d) => [d.sha, d.text]),
    [
      [commits.third, 'Gapless is part of playback'],
      [commits.first, 'Keep the screenshots local'],
    ],
  );
  assert.match(progress.decisions[0].date, /^\d{4}-\d\d-\d\d$/);
  assert.deepEqual(
    progress.sortedIdeas.map((s) => [s.sha, s.file, s.plan]),
    [[commits.third, 'docs/inbox/gapless-idea.md', 'M1.play']],
  );
});

test('the outbox lists each item, and more than five is over-asking', () => {
  const { progress } = progressOf(STANDARD, {}, (root) => {
    for (let i = 1; i <= 5; i++)
      write(root, `docs/outbox/extra-${i}.md`, `# Extra ${i}\n\nkind: name\ndefault: Keep it.\n`);
  });
  assert.equal(progress.outbox.length, 6);
  assert.deepEqual(progress.outbox.at(-1), {
    file: 'screenshots.md',
    title: 'Screenshots in the public repo?',
    kind: 'published',
    default: 'They stay out of git.',
  });
  assert.equal(progress.overAsking, true);
  assert.match(
    formatSummary(progress),
    /More than five open outbox items: sessions are over-asking\./,
  );
});

test('progress is plain JSON, with the commit and its date', () => {
  const { progress, commits } = progressOf();
  assert.deepEqual(JSON.parse(JSON.stringify(progress)), progress);
  assert.equal(progress.commit, commits.head);
  assert.match(progress.commitDate, /^\d{4}-\d\d-\d\d$/);
});

test('an empty plan still summarises, with no milestones yet', () => {
  const { progress } = progressOf(STANDARD, {}, (root) => {
    for (const f of ['_header.md', '00-intro.md', '01-flow.md', '02-milestones.md'])
      git(root, 'rm', '-q', `docs/plan/${f}`);
  });
  assert.deepEqual([progress.milestones, progress.current, progress.next], [[], null, null]);
  assert.match(formatSummary(progress), /^Auralis plan · no milestones yet/);
});
