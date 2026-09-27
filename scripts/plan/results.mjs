/**
 * Where plan check results come from. CI jobs turn their JUnit XML into plan-results.json
 * (collect-results.mjs) and upload it as a `plan-results-*` artifact; `loadResults` downloads
 * the newest ones that HEAD contains. Nothing here is stored in the repo.
 *
 * Every command goes through an injectable `exec(cmd, args, opts) → stdout`, so tests never
 * touch the network or the real `gh`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export function defaultExec(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });
}

export const git = (exec, root, ...args) => String(exec('git', args, { cwd: root })).trim();

const firstLine = (err) =>
  String(err?.stderr || err?.message || err)
    .trim()
    .split('\n')[0];

/**
 * Options for one `gh` call: killed (SIGKILL) at `deadline` (epoch ms), so a hanging `gh` never
 * outlives the caller's budget. Throws a timeout when the deadline has already passed.
 */
function ghOpts(root, deadline) {
  if (deadline === undefined) return { cwd: root };
  const timeout = deadline - Date.now();
  if (timeout <= 0) throw Object.assign(new Error('deadline passed'), { code: 'ETIMEDOUT' });
  return { cwd: root, timeout, killSignal: 'SIGKILL' };
}

const ghFailure = (what, err, budget) =>
  err?.code === 'ETIMEDOUT' && budget !== undefined
    ? `${what} timed out after ${Math.round(budget / 1000)} s`
    : `${what} failed: ${firstLine(err)}`;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) =>
  s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e) =>
    e[0] === '#'
      ? String.fromCodePoint(
          e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)),
        )
      : ENTITIES[e.toLowerCase()],
  );

/**
 * Reads the testcases of a JUnit XML file (vitest, node:test or Gradle) as `{ name, status }`.
 * A `<skipped>` wins over a failure, so a failing node:test todo counts as not run.
 */
export function parseJUnit(xml) {
  const cases = [];
  const re = /<testcase\b((?:[^>"]|"[^"]*")*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  for (const m of xml.matchAll(re)) {
    const name = /\bname="([^"]*)"/.exec(m[1]);
    if (!name) continue;
    const body = m[3] ?? '';
    const status = /<skipped\b/.test(body)
      ? 'skipped'
      : /<(failure|error)\b/.test(body)
        ? 'failed'
        : 'passed';
    cases.push({ name: decode(name[1]), status });
  }
  return cases;
}

const JS_TAG = /\[(M[0-6]\.[a-z][a-z0-9]{1,15})\/([a-f])\]/;
const JVM_TAG = /^(M[0-6])_([a-z][a-z0-9]{1,15})_([a-f])(?:_|\s|$)/;

/** The plan check a test name is tagged with: `{ item, criterion }`, or null. */
export function tagOf(name) {
  const js = JS_TAG.exec(name);
  if (js) return { item: js[1], criterion: js[2] };
  const jvm = JVM_TAG.exec(name);
  if (jvm) return { item: `${jvm[1]}.${jvm[2]}`, criterion: jvm[3] };
  return null;
}

/** The plan-results.json object for one CI job: its tagged tests only. */
export function collectResults({ workflow, job, commit, xmls }) {
  const tests = [];
  for (const xml of xmls) {
    for (const { name, status } of parseJUnit(xml)) {
      const t = tagOf(name);
      if (t) tests.push({ item: t.item, criterion: t.criterion, name, status });
    }
  }
  return { commit, workflow, job, tests };
}

function* jsonFiles(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* jsonFiles(path);
    else if (entry.name.endsWith('.json')) yield path;
  }
}

function isAncestor(exec, root, sha) {
  try {
    exec('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

/** Downloads (once per run id) and reads a run's plan-results files. */
function runResults(exec, root, runId, deadline) {
  const rel = join('.cache', 'plan', 'runs', String(runId));
  const dir = join(root, rel);
  if (!existsSync(dir)) {
    try {
      exec(
        'gh',
        ['run', 'download', String(runId), '--pattern', 'plan-results-*', '--dir', rel],
        ghOpts(root, deadline),
      );
    } catch {
      return [];
    }
  }
  return [...jsonFiles(dir)].flatMap((f) => JSON.parse(readFileSync(f, 'utf8')).tests ?? []);
}

function ciResults(exec, root, deadline, budget) {
  let runs;
  try {
    const out = exec(
      'gh',
      [
        'run',
        'list',
        '--branch',
        'main',
        '--limit',
        '100',
        '--json',
        'databaseId,headSha,workflowName,status,conclusion,createdAt',
      ],
      ghOpts(root, deadline),
    );
    runs = JSON.parse(out);
  } catch (err) {
    return { runs: [], error: ghFailure('gh run list', err, budget) };
  }
  const newest = new Map();
  for (const run of runs) {
    if (run.status !== 'completed' || !isAncestor(exec, root, run.headSha)) continue;
    const kept = newest.get(run.workflowName);
    if (!kept || run.createdAt > kept.createdAt) newest.set(run.workflowName, run);
  }
  return {
    runs: [...newest.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    error: null,
  };
}

const nodeTestFiles = (root) =>
  ['scripts', 'scripts/plan'].flatMap((d) =>
    existsSync(join(root, d))
      ? readdirSync(join(root, d))
          .filter((f) => f.endsWith('.test.mjs'))
          .sort()
          .map((f) => `${d}/${f}`)
      : [],
  );

/** Runs this checkout's vitest and node tests with JUnit reporters; returns their tagged tests. */
function localResults(exec, root) {
  const dir = join(root, '.cache', 'plan', 'local');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const vitest = join(dir, 'vitest.xml');
  const node = join(dir, 'node.xml');
  const attempt = (cmd, args) => {
    try {
      exec(cmd, args, { cwd: root });
    } catch {
      // A failing test exits non-zero; its XML still says which.
    }
  };
  attempt('pnpm', ['exec', 'vitest', 'run', '--reporter=junit', `--outputFile.junit=${vitest}`]);
  attempt('node', [
    '--test',
    '--test-reporter=junit',
    `--test-reporter-destination=${node}`,
    ...nodeTestFiles(root),
  ]);
  const xmls = [vitest, node].filter(existsSync).map((f) => readFileSync(f, 'utf8'));
  return collectResults({ workflow: 'local', job: 'local', commit: null, xmls }).tests;
}

/**
 * Loads check results. `mode`: 'ci' (the newest CI artifacts HEAD contains), 'local' (those,
 * then this checkout's own test run on top) or 'none'. Returns `{ sources, tests, error }`;
 * `error` set means no results could be read, so criteria are unknown. `ghDeadline` (epoch ms)
 * kills any `gh` call still running then, so none outlives a hook's budget.
 */
export function loadResults({ root, mode = 'ci', exec = defaultExec, ghDeadline }) {
  if (mode === 'none') return { sources: [], tests: [], error: 'not requested (--no-results)' };
  const byName = new Map();
  const sources = [];
  const budget = ghDeadline === undefined ? undefined : ghDeadline - Date.now();
  const ci = ciResults(exec, root, ghDeadline, budget);
  for (const run of ci.runs) {
    for (const t of runResults(exec, root, run.databaseId, ghDeadline)) byName.set(t.name, t);
    const behind = Number(git(exec, root, 'rev-list', '--count', `${run.headSha}..HEAD`));
    sources.push({
      workflow: run.workflowName,
      runId: run.databaseId,
      commit: run.headSha,
      behind,
    });
  }
  let error = ci.error ?? (sources.length ? null : 'no CI run on main that HEAD contains');
  if (mode === 'local') {
    for (const t of localResults(exec, root)) byName.set(t.name, t);
    sources.push({
      workflow: 'local',
      runId: null,
      commit: git(exec, root, 'rev-parse', 'HEAD'),
      behind: 0,
    });
    error = null;
  }
  const tests = error
    ? []
    : [...byName.values()].map(({ item, criterion, name, status }) => ({
        item,
        criterion,
        name,
        status,
      }));
  return { sources, tests, error };
}
