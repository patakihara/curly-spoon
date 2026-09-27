/**
 * Test results for the plan: JUnit XML from vitest, node:test and Gradle, check tags in test
 * names, the plan-results.json that CI uploads, and reading those back from CI runs.
 * Run: node --test scripts/plan/results.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectResults, loadResults, parseJUnit, tagOf } from './results.mjs';
import { fakeExec, fixtureRepo, read, removeTree, tag, write } from './testing.mjs';

const VITEST_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<testsuites name="vitest tests" tests="3" failures="1" errors="0" time="1.117">
    <testsuite name="server/src/app.test.ts" timestamp="2026-09-27T20:20:19.252Z" hostname="host" tests="3" failures="1" errors="0" skipped="1" time="0.277">
        <testcase classname="server/src/app.test.ts" name="GET /health &gt; answers ok" time="0.228">
        </testcase>
        <testcase classname="server/src/app.test.ts" name="GET /health &gt; ${tag('M0.aa', 'a')} reports the commit" time="0.02">
            <failure message="expected &apos;abc&apos; to be &apos;def&apos;" type="AssertionError">
AssertionError: expected 'abc' to be 'def'
            </failure>
        </testcase>
        <testcase classname="server/src/app.test.ts" name="GET /health &gt; later" time="0">
            <skipped/>
        </testcase>
    </testsuite>
</testsuites>
`;

const NODE_XML = `<?xml version="1.0" encoding="utf-8"?>
<testsuites>
	<testsuite name="group" time="0.001" disabled="0" errors="0" tests="1" failures="0" skipped="0" hostname="host">
		<testcase name="inner &amp; &lt;x>" time="0.0005" classname="test"/>
	</testsuite>
	<testcase name="fails" time="0.0001" classname="test" failure="boom">
		<failure type="testCodeFailure" message="boom">
[Error [ERR_TEST_FAILURE]: boom]
		</failure>
	</testcase>
	<testcase name="todo one" time="0.0001" classname="test" failure="x">
		<skipped type="todo" message="later"/>
		<failure type="testCodeFailure" message="x">
[Error [ERR_TEST_FAILURE]: x]
		</failure>
	</testcase>
	<!-- tests 3 -->
</testsuites>
`;

const GRADLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="app.auralis.PlayerTest" tests="3" skipped="1" failures="1" errors="0" timestamp="2026-09-27T10:00:00" hostname="runner" time="0.12">
  <properties/>
  <testcase name="M1_gapless_b_second file follows first" classname="app.auralis.PlayerTest" time="0.05"/>
  <testcase name="crashes" classname="app.auralis.PlayerTest" time="0.01">
    <error message="java.lang.IllegalStateException" type="java.lang.IllegalStateException">stack</error>
  </testcase>
  <testcase name="ignored" classname="app.auralis.PlayerTest" time="0.0">
    <skipped/>
  </testcase>
  <system-out><![CDATA[]]></system-out>
  <system-err><![CDATA[]]></system-err>
</testsuite>
`;

test('parseJUnit reads vitest output: full names, failures and skips', () => {
  assert.deepEqual(parseJUnit(VITEST_XML), [
    { name: 'GET /health > answers ok', status: 'passed' },
    { name: `GET /health > ${tag('M0.aa', 'a')} reports the commit`, status: 'failed' },
    { name: 'GET /health > later', status: 'skipped' },
  ]);
});

test('parseJUnit reads node:test output, and a todo test counts as skipped even when it fails', () => {
  assert.deepEqual(parseJUnit(NODE_XML), [
    { name: 'inner & <x>', status: 'passed' },
    { name: 'fails', status: 'failed' },
    { name: 'todo one', status: 'skipped' },
  ]);
});

test('parseJUnit reads Gradle output, where an error is a failure', () => {
  assert.deepEqual(parseJUnit(GRADLE_XML), [
    { name: 'M1_gapless_b_second file follows first', status: 'passed' },
    { name: 'crashes', status: 'failed' },
    { name: 'ignored', status: 'skipped' },
  ]);
});

test('tagOf reads the bracket tag anywhere in a JS test name', () => {
  assert.deepEqual(tagOf(`player > ${tag('M1.gapless', 'a')} second file starts with no gap`), {
    item: 'M1.gapless',
    criterion: 'a',
  });
});

test('tagOf reads the JVM spelling at the start of a method name', () => {
  assert.deepEqual(tagOf('M1_gapless_b_second file follows first'), {
    item: 'M1.gapless',
    criterion: 'b',
  });
  assert.deepEqual(tagOf('M1_gapless_b_secondFileFollowsFirst'), {
    item: 'M1.gapless',
    criterion: 'b',
  });
  assert.deepEqual(tagOf('M1_gapless_c'), { item: 'M1.gapless', criterion: 'c' });
});

test('tagOf returns null for an untagged name or a malformed tag', () => {
  assert.equal(tagOf('answers ok'), null);
  assert.equal(tagOf(tag('M7.gapless', 'a')), null);
  assert.equal(tagOf(tag('M1.gapless', 'g')), null);
  assert.equal(tagOf('M1_gapless_bx'), null);
  assert.equal(tagOf('testM1_gapless_b_x'), null);
});

test('collectResults keeps only tagged tests, with their item, criterion and status', () => {
  const results = collectResults({
    workflow: 'ci',
    job: 'unit',
    commit: 'a'.repeat(40),
    xmls: [VITEST_XML, GRADLE_XML],
  });
  assert.deepEqual(results, {
    commit: 'a'.repeat(40),
    workflow: 'ci',
    job: 'unit',
    tests: [
      {
        item: 'M0.aa',
        criterion: 'a',
        name: `GET /health > ${tag('M0.aa', 'a')} reports the commit`,
        status: 'failed',
      },
      {
        item: 'M1.gapless',
        criterion: 'b',
        name: 'M1_gapless_b_second file follows first',
        status: 'passed',
      },
    ],
  });
});

test('the collect-results CLI writes plan-results.json from the XML files it is given', () => {
  const { root } = fixtureRepo();
  try {
    write(root, 'reports/junit/vitest.xml', VITEST_XML);
    const cli = join(dirname(fileURLToPath(import.meta.url)), 'collect-results.mjs');
    execFileSync(
      'node',
      [
        cli,
        '--workflow',
        'ci',
        '--job',
        'unit',
        '--out',
        'reports/plan-results.json',
        'reports/junit/vitest.xml',
        'reports/junit/missing.xml',
      ],
      { cwd: root, env: { ...process.env, GITHUB_SHA: 'b'.repeat(40) }, stdio: 'pipe' },
    );
    const written = JSON.parse(read(root, 'reports/plan-results.json'));
    assert.equal(written.commit, 'b'.repeat(40));
    assert.deepEqual(
      written.tests.map((t) => [t.item, t.criterion, t.status]),
      [['M0.aa', 'a', 'failed']],
    );
  } finally {
    removeTree(root);
  }
});

const result = (commit, tests) => ({ commit, workflow: 'ci', job: 'unit', tests });
const t = (item, criterion, status, name = `${tag(item, criterion)} check`) => ({
  item,
  criterion,
  name,
  status,
});

function ciScenario() {
  const repo = fixtureRepo();
  const { first, second, third, head } = repo.commits;
  const runs = [
    {
      databaseId: 11,
      headSha: first,
      workflowName: 'CI',
      status: 'completed',
      conclusion: 'failure',
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      databaseId: 12,
      headSha: third,
      workflowName: 'CI',
      status: 'completed',
      conclusion: 'success',
      createdAt: '2026-01-03T00:00:00Z',
    },
    {
      databaseId: 13,
      headSha: 'f'.repeat(40),
      workflowName: 'CI',
      status: 'completed',
      conclusion: 'success',
      createdAt: '2026-01-05T00:00:00Z',
    },
    {
      databaseId: 14,
      headSha: head,
      workflowName: 'CI',
      status: 'in_progress',
      conclusion: '',
      createdAt: '2026-01-06T00:00:00Z',
    },
    {
      databaseId: 15,
      headSha: second,
      workflowName: 'Android',
      status: 'completed',
      conclusion: 'failure',
      createdAt: '2026-01-02T00:00:00Z',
    },
  ];
  const artifacts = {
    11: [result(first, [t('M0.bb', 'a', 'failed')])],
    12: [result(third, [t('M0.aa', 'a', 'passed'), t('M0.bb', 'a', 'passed')])],
    15: [result(second, [t('M0.aa', 'a', 'failed'), t('M0.cc', 'a', 'failed')])],
  };
  return { ...repo, exec: fakeExec({ runs, artifacts }) };
}

test('loadResults takes the newest completed run per workflow that HEAD contains', () => {
  const { root, commits, exec } = ciScenario();
  try {
    const { sources, error } = loadResults({ root, mode: 'ci', exec });
    assert.equal(error, null);
    assert.deepEqual(sources, [
      { workflow: 'Android', runId: 15, commit: commits.second, behind: 2 },
      { workflow: 'CI', runId: 12, commit: commits.third, behind: 1 },
    ]);
  } finally {
    removeTree(root);
  }
});

test('loadResults unions the tests, and for the same test name the newer run wins', () => {
  const { root, exec } = ciScenario();
  try {
    const { tests } = loadResults({ root, mode: 'ci', exec });
    assert.deepEqual(tests.map((x) => [x.item, x.criterion, x.status]).sort(), [
      ['M0.aa', 'a', 'passed'],
      ['M0.bb', 'a', 'passed'],
      ['M0.cc', 'a', 'failed'],
    ]);
  } finally {
    removeTree(root);
  }
});

test('loadResults caches a downloaded run by its id', () => {
  const { root, exec } = ciScenario();
  try {
    loadResults({ root, mode: 'ci', exec });
    assert.ok(existsSync(join(root, '.cache/plan/runs/12')));
    const downloads = () => exec.calls.filter((c) => c[0] === 'gh' && c[2] === 'download').length;
    const before = downloads();
    loadResults({ root, mode: 'ci', exec });
    assert.equal(downloads(), before);
  } finally {
    removeTree(root);
  }
});

test('loadResults reports an error and no tests when gh fails', () => {
  const { root } = fixtureRepo();
  try {
    const { sources, tests, error } = loadResults({
      root,
      mode: 'ci',
      exec: fakeExec({ failGh: true }),
    });
    assert.deepEqual([sources, tests], [[], []]);
    assert.match(error, /gh run list failed: gh: could not reach/);
  } finally {
    removeTree(root);
  }
});

test('loadResults with mode none reads nothing and says so', () => {
  const exec = fakeExec();
  const { sources, tests, error } = loadResults({ root: '/nonexistent', mode: 'none', exec });
  assert.deepEqual([sources, tests, exec.calls], [[], [], []]);
  assert.match(error, /not requested/);
});

test('loadResults in local mode lays this checkout’s own test run over CI as the newest source', () => {
  const { root, commits, exec: ci } = ciScenario();
  try {
    const exec = (cmd, args, opts) => {
      if (cmd === 'pnpm' || cmd === 'node') {
        const dest = args.find(
          (a) =>
            a.startsWith('--outputFile.junit=') || a.startsWith('--test-reporter-destination='),
        );
        const path = dest.slice(dest.indexOf('=') + 1);
        mkdirSync(dirname(path), { recursive: true });
        const name = cmd === 'node' ? `${tag('M0.cc', 'a')} check` : 'untagged';
        writeFileSync(path, `<testsuites><testcase name="${name}" classname="x"/></testsuites>`);
        if (cmd === 'node') throw new Error('some other test failed');
        return '';
      }
      return ci(cmd, args, opts);
    };
    const { sources, tests } = loadResults({ root, mode: 'local', exec });
    assert.deepEqual(sources.at(-1), {
      workflow: 'local',
      runId: null,
      commit: commits.head,
      behind: 0,
    });
    assert.equal(tests.find((x) => x.item === 'M0.cc').status, 'passed');
  } finally {
    removeTree(root);
  }
});
