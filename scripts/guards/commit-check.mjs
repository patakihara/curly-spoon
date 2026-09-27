/**
 * Plan: line rules. A commit that touches an app path (APP_PATHS) names the plan item it serves
 * in a `Plan: <item id>` line; every Plan: line names an item in docs/plan or is `Plan: none`,
 * and `Plan: none` is only for commits that touch no app path. The commit-msg hook
 * (.githooks/commit-msg) checks a commit being made; CI checks the commits a push adds. A merge
 * is judged by its own changes only: the paths that differ from every parent.
 *
 * CLI: node scripts/guards/commit-check.mjs --msg-file <path>
 *      node scripts/guards/commit-check.mjs --before <sha> --after <sha> --ref <name>
 *           [--default-branch main] [--root <dir>]
 * The hook fails open on an error; CI mode exits 2 on one.
 */
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readPlan } from '../plan/parse.mjs';

export const APP_PATHS = ['server/', 'web/', 'android/', 'schema/', 'design/', 'docs/plan/'];

const ZERO = /^0+$/;

const gitIn = (root, ...args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  }).trim();

const succeeds = (root, ...args) => {
  try {
    gitIn(root, ...args);
    return true;
  } catch {
    return false;
  }
};

const lines = (text) => text.split('\n').filter(Boolean);

/** Every item id in the checked-out plan, exits included. */
export function planIds(root) {
  const plan = readPlan(join(root, 'docs', 'plan'), []);
  return new Set((plan?.milestones ?? []).flatMap((m) => m.items.map((i) => i.id)));
}

/** The problems with a commit's message for the files it changes; empty when it is fine. */
export function checkMessage({ message, files, ids }) {
  const values = message
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .map((line) => line.match(/^Plan:[ \t]*(.*?)[ \t]*$/))
    .filter(Boolean)
    .map((m) => m[1]);
  const problems = values
    .filter((v) => v !== 'none' && !ids.has(v))
    .map((v) => `Plan: ${v} names no item in docs/plan`);
  const app = files.find((f) => APP_PATHS.some((p) => f.startsWith(p)));
  if (app && !values.some((v) => ids.has(v))) {
    if (!values.length) problems.push(`an app change (${app}) needs a "Plan: <item id>" line`);
    else if (values.every((v) => v === 'none'))
      problems.push(`Plan: none is only for commits that touch no app path (${app})`);
  }
  return problems;
}

/** Every remote-tracking ref except the pushed `ref` itself and the symbolic origin/HEAD. */
function otherRemoteRefs(root, ref) {
  const pushed = new Set([`refs/remotes/origin/${ref}`, 'refs/remotes/origin/HEAD']);
  return lines(gitIn(root, 'for-each-ref', '--format=%(refname)', 'refs/remotes')).filter(
    (r) => !pushed.has(r),
  );
}

/**
 * The commits, merges included, a push from `before` to `after` on `ref` adds, oldest first.
 * With no usable `before` (a new branch, or a force-push from a tip this clone lacks) that is
 * every commit no other remote branch has; only when that is empty or fails, the tip alone.
 */
export function rangeCommits({ root, before, after, ref, defaultBranch = 'main' }) {
  if (!after || ZERO.test(after)) return { shas: [], note: 'nothing pushed' };
  const main = `origin/${defaultBranch}`;
  const excludeDefault =
    ref !== defaultBranch && succeeds(root, 'rev-parse', '--verify', '-q', `refs/remotes/${main}`);
  const known =
    before && !ZERO.test(before) && succeeds(root, 'cat-file', '-e', `${before}^{commit}`);
  const list = (...args) => lines(gitIn(root, 'rev-list', '--reverse', ...args));
  if (known) return { shas: list(after, '--not', before, ...(excludeDefault ? [main] : [])) };
  const why = before && !ZERO.test(before) ? 'unknown previous tip' : 'new branch';
  let shas = [];
  try {
    shas = list(after, '--not', ...otherRemoteRefs(root, ref));
  } catch {
    // fall back to the tip below
  }
  if (shas.length) return { shas, note: `${why}: checking commits on no other remote branch` };
  return {
    shas: list('-1', after),
    note: `${why}: checking ${gitIn(root, 'rev-parse', after).slice(0, 7)} only`,
  };
}

/**
 * The paths a merge changes itself: those differing from every parent, i.e. its conflict
 * resolutions. `diff` lists the paths the result differs from one parent in.
 */
export function mergeOwnFiles(parents, diff) {
  const [first, ...rest] = parents.map((p) => new Set(diff(p)));
  return [...first].filter((f) => rest.every((s) => s.has(f)));
}

/** The problems with one commit; a commit whose tree has no docs/plan is foreign and skipped. */
export function checkCommit(root, sha, ids) {
  if (!succeeds(root, 'cat-file', '-e', `${sha}:docs/plan`)) return [];
  const parents = gitIn(root, 'rev-list', '--parents', '-n', '1', sha).split(' ').slice(1);
  const files =
    parents.length > 1
      ? mergeOwnFiles(parents, (p) => lines(gitIn(root, 'diff', '--name-only', p, sha)))
      : lines(gitIn(root, 'diff-tree', '--no-commit-id', '--name-only', '-r', '--root', sha));
  const message = gitIn(root, 'log', '-1', '--format=%B', sha);
  return checkMessage({ message, files, ids });
}

function hookMode(msgFile) {
  try {
    const root = gitIn(process.cwd(), 'rev-parse', '--show-toplevel');
    let mergeHead = gitIn(root, 'rev-parse', '--git-path', 'MERGE_HEAD');
    if (!isAbsolute(mergeHead)) mergeHead = join(root, mergeHead);
    const staged = (...against) =>
      lines(gitIn(root, 'diff', '--cached', '--name-only', ...against));
    const files = existsSync(mergeHead)
      ? mergeOwnFiles(['HEAD', ...lines(readFileSync(mergeHead, 'utf8'))], staged)
      : staged();
    const problems = checkMessage({
      message: readFileSync(msgFile, 'utf8'),
      files,
      ids: planIds(root),
    });
    if (!problems.length) return 0;
    for (const p of problems) console.error(`commit-msg: ${p}`);
    console.error(
      'Add a "Plan: <item id>" line naming an item in docs/plan (Plan: none only when no app path is touched). Bypass: git commit --no-verify.',
    );
    return 1;
  } catch (error) {
    console.error(`commit-msg: ${error.message}; allowing`);
    return 0;
  }
}

function ciMode(values) {
  try {
    const root = values.root ?? gitIn(process.cwd(), 'rev-parse', '--show-toplevel');
    const { shas, note } = rangeCommits({
      root,
      before: values.before,
      after: values.after,
      ref: values.ref,
      defaultBranch: values['default-branch'] ?? 'main',
    });
    if (note) console.log(note);
    const ids = planIds(root);
    let failed = false;
    for (const sha of shas) {
      const subject = gitIn(root, 'log', '-1', '--format=%s', sha);
      const problems = checkCommit(root, sha, ids);
      if (!problems.length) console.log(`ok ${sha.slice(0, 7)} ${subject}`);
      for (const p of problems) console.log(`FAIL ${sha.slice(0, 7)} ${subject}: ${p}`);
      failed ||= problems.length > 0;
    }
    return failed ? 1 : 0;
  } catch (error) {
    console.error(`commit-check: ${error.message}`);
    return 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      'msg-file': { type: 'string' },
      before: { type: 'string' },
      after: { type: 'string' },
      ref: { type: 'string' },
      'default-branch': { type: 'string' },
      root: { type: 'string' },
    },
  });
  process.exitCode = values['msg-file'] ? hookMode(values['msg-file']) : ciMode(values);
}
