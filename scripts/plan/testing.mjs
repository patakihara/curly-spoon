/**
 * Shared helpers for the plan tooling's node:test files: synthetic plan trees in os.tmpdir(),
 * a fixture git repo, and a fake `gh`. Not a test file itself.
 */
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURES = join(here, 'test-fixtures');
export const REPO_ROOT = join(here, '..', '..');

/**
 * Builds a check tag from its parts, so a test source never spells a synthetic tag literally
 * (the orphan-tag lint would otherwise read it as a real one).
 */
export const tag = (item, criterion) => '[' + item + '/' + criterion + ']';

/** A fresh repo-shaped tree holding the fixture plan and outbox. Returns its root. */
export function fixtureTree() {
  const root = mkdtempSync(join(tmpdir(), 'plan-fixture-'));
  cpSync(join(FIXTURES, 'plan'), join(root, 'docs', 'plan'), { recursive: true });
  cpSync(join(REPO_ROOT, 'docs', 'plan', 'page.css'), join(root, 'docs', 'plan', 'page.css'));
  mkdirSync(join(root, 'docs', 'outbox'), { recursive: true });
  writeFileSync(join(root, 'docs', 'outbox', 'README.md'), '# docs/outbox\n\nNot an item.\n');
  cpSync(
    join(FIXTURES, 'outbox', 'screenshots.md'),
    join(root, 'docs', 'outbox', 'screenshots.md'),
  );
  return root;
}

export const removeTree = (root) => rmSync(root, { recursive: true, force: true });

export const read = (root, path) => readFileSync(join(root, path), 'utf8');

export function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

/** Rewrites one file of a tree through `edit(text) → text`. */
export function edit(root, path, fn) {
  write(root, path, fn(read(root, path)));
}

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
  GIT_COMMITTER_NAME: 'Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

export function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, env: GIT_ENV, encoding: 'utf8' }).trim();
}

/**
 * The fixture repo: the fixture plan, one outbox item, two `Decision:` commits, a sorted idea,
 * a `plan/M0.aa` branch with a description and a `signoff/M0.exit` tag. Returns
 * `{ root, commits: { first, second, third, head } }`.
 */
export function fixtureRepo() {
  const root = fixtureTree();
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(
    root,
    'commit',
    '-q',
    '-m',
    'Add the plan',
    '-m',
    'Plan: M0.aa\nDecision: Keep the screenshots local',
  );
  const first = git(root, 'rev-parse', 'HEAD');
  write(root, 'docs/inbox/gapless-idea.md', 'Make it gapless.\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'Inbox: gapless idea');
  const second = git(root, 'rev-parse', 'HEAD');
  git(root, 'rm', '-q', 'docs/inbox/gapless-idea.md');
  git(
    root,
    'commit',
    '-q',
    '-m',
    'Sort the gapless idea',
    '-m',
    'Plan: M1.play\nDecision: Gapless is part of playback',
  );
  const third = git(root, 'rev-parse', 'HEAD');
  git(root, 'branch', 'plan/M0.aa');
  git(root, 'config', 'branch.plan/M0.aa.description', 'parser done; next: lint');
  git(root, 'tag', '-a', 'signoff/M0.exit', '-m', 'Sofia: it works');
  write(root, 'notes.txt', 'unrelated\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'Unrelated change');
  const head = git(root, 'rev-parse', 'HEAD');
  return { root, commits: { first, second, third, head } };
}

/**
 * An `exec` that runs git for real and answers `gh` from `runs` (the `gh run list` rows) and
 * `artifacts` (run id → the plan-results.json objects that run uploaded). `failGh` makes every
 * gh call throw, as when gh is missing or offline.
 */
export function fakeExec({ runs = [], artifacts = {}, failGh = false } = {}) {
  const calls = [];
  const exec = (cmd, args, opts = {}) => {
    calls.push([cmd, ...args]);
    if (cmd !== 'gh') {
      return execFileSync(cmd, args, { encoding: 'utf8', env: GIT_ENV, ...opts, stdio: 'pipe' });
    }
    if (failGh) throw new Error('gh: could not reach api.github.com');
    if (args[0] === 'run' && args[1] === 'list') return JSON.stringify(runs);
    if (args[0] === 'run' && args[1] === 'download') {
      const id = args[2];
      const dir = args[args.indexOf('--dir') + 1];
      const list = artifacts[id];
      if (!list) throw new Error('no valid artifacts found to download');
      list.forEach((results, i) => {
        const path = resolve(opts.cwd ?? '.', dir, `plan-results-${i}`, 'plan-results.json');
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, JSON.stringify(results));
      });
      return '';
    }
    throw new Error(`fake gh: unexpected ${args.join(' ')}`);
  };
  exec.calls = calls;
  return exec;
}
