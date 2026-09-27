/**
 * Shared helpers for the guards' node:test files: running a hook with a payload on stdin, a
 * fixture repo with recorded publishes, and a fake `gh` put on PATH. Not a test file itself.
 */
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, fixtureRepo, git, write } from '../plan/testing.mjs';
import { SOURCES, sourcesTree } from '../plan/record-publish.mjs';

export const HOOKS_DIR = dirname(fileURLToPath(import.meta.url));

/** The environment a hook test runs in: this one minus CLAUDE_PROJECT_DIR, plus `env`. */
export function hookEnv(env = {}) {
  const base = { ...process.env };
  delete base.CLAUDE_PROJECT_DIR;
  return { ...base, ...env };
}

/** Runs `scripts/guards/<name>` with `payload` on stdin (a string is sent raw). */
export function runHook(name, payload, { env = {}, cwd, timeout } = {}) {
  return spawnSync(process.execPath, [join(HOOKS_DIR, name)], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    env: hookEnv(env),
    encoding: 'utf8',
    cwd,
    timeout,
  });
}

/**
 * `fixtureRepo()` plus design/sonora and design/app, the guards' published-sources.json with
 * `checked`, and design/published.json recording the current tree of every checked source,
 * committed as one `Publish fixtures` commit.
 */
export function publishedRepo({ checked }) {
  const repo = fixtureRepo();
  const { root } = repo;
  write(root, 'design/sonora/README.md', '# Sonora\n');
  write(root, 'design/app/nav.json', '{"tabs":[]}\n');
  write(root, 'scripts/guards/published-sources.json', JSON.stringify({ checked }) + '\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'Add design sources');
  const published = {};
  for (const artifact of checked) {
    const sources = SOURCES[artifact];
    if (!sources) continue;
    published[artifact] = {
      url: `https://claude.ai/artifact/${artifact}`,
      sources,
      commit: git(root, 'rev-parse', 'HEAD'),
      tree: sourcesTree(root, sources),
    };
  }
  write(root, 'design/published.json', JSON.stringify(published, null, 2) + '\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'Publish fixtures', '-m', 'Plan: M0.aa');
  return { root, commits: { ...repo.commits, head: git(root, 'rev-parse', 'HEAD') } };
}

/**
 * A directory holding an executable fake `gh`. `fail` exits 1 as when offline, `hang` sleeps
 * 60 s, `answer` prints `runs` for `run list` and writes `artifacts[id]` for `run download`.
 */
export function fakeGh({ mode, runs = [], artifacts = {} }) {
  const dir = mkdtempSync(join(tmpdir(), 'guards-gh-'));
  writeFileSync(join(dir, 'gh.json'), JSON.stringify({ mode, runs, artifacts }));
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { mode, runs, artifacts } = JSON.parse(fs.readFileSync(path.join(__dirname, 'gh.json'), 'utf8'));
const args = process.argv.slice(2);
if (mode === 'fail') {
  process.stderr.write('gh: could not reach api.github.com\\n');
  process.exit(1);
}
if (mode === 'hang') {
  fs.appendFileSync(path.join(__dirname, 'gh.pids'), process.pid + '\\n');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000);
  process.exit(1);
}
if (args[0] === 'run' && args[1] === 'list') {
  process.stdout.write(JSON.stringify(runs));
  process.exit(0);
}
if (args[0] === 'run' && args[1] === 'download') {
  const list = artifacts[args[2]];
  if (!list) process.exit(1);
  const dir = args[args.indexOf('--dir') + 1];
  list.forEach((results, i) => {
    const file = path.resolve(process.cwd(), dir, 'plan-results-' + i, 'plan-results.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(results));
  });
  process.exit(0);
}
process.exit(1);
`;
  writeFileSync(join(dir, 'gh'), script);
  chmodSync(join(dir, 'gh'), 0o755);
  return dir;
}

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

/** `fixtureRepo()` with this repo's .githooks/commit-msg linked in as its only hook. */
export function commitRepo() {
  const repo = fixtureRepo();
  const hooks = mkdtempSync(join(tmpdir(), 'guards-hooks-'));
  symlinkSync(join(REPO_ROOT, '.githooks', 'commit-msg'), join(hooks, 'commit-msg'));
  git(repo.root, 'config', 'core.hooksPath', hooks);
  return { ...repo, hooks };
}

/** Writes `files` (path → text), stages them and commits with `message`; never throws. */
export function commitWith(root, files, message, ...flags) {
  for (const [path, text] of Object.entries(files)) {
    write(root, path, text);
    git(root, 'add', '--', path);
  }
  const dir = mkdtempSync(join(tmpdir(), 'guards-msg-'));
  const msgFile = join(dir, 'message');
  writeFileSync(msgFile, message);
  try {
    return spawnSync('git', ['commit', '-q', ...flags, '-F', msgFile], {
      cwd: root,
      env: hookEnv(GIT_ENV),
      encoding: 'utf8',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export const pathWith = (dir) => `${dir}:${process.env.PATH}`;
