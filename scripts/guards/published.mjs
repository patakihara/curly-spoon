/**
 * The merge check: every artifact listed in scripts/guards/published-sources.json must have the
 * tree design/published.json recorded for its last publish, and a record for it at all (a missing
 * one fails as never published). An artifact that installs another (the canvas installs Sonora)
 * must have installed the version recorded as that one's current publish. Used by CI (committed trees) and by
 * the Stop hook (working tree, uncommitted changes included). SOURCES in
 * scripts/plan/record-publish.mjs maps each artifact to its folders (the plan's are docs/plan and
 * docs/outbox), and its sourcesTree/combineTrees are the one tree scheme everything compares.
 *
 * CLI: node scripts/guards/published.mjs [--worktree] [--root <dir>]
 * Exit 0 when everything matches, 1 on drift, 2 on an error.
 */
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { SOURCES, combineTrees, sourcesTree, staleInstalls } from '../plan/record-publish.mjs';

const gitIn = (root, args, env) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: env ? { ...process.env, ...env } : process.env,
  }).trim();

/** The artifacts the check covers, as `[{ artifact, sources }]`. */
export function readChecked(root) {
  const path = join(root, 'scripts', 'guards', 'published-sources.json');
  if (!existsSync(path)) return [];
  const { checked = [] } = JSON.parse(readFileSync(path, 'utf8'));
  return checked.map((artifact) => {
    const sources = SOURCES[artifact];
    if (!sources) throw new Error(`published-sources.json: unknown artifact "${artifact}"`);
    return { artifact, sources };
  });
}

/**
 * The folders' combined tree at HEAD, or as it would be if committed now (`worktree`),
 * uncommitted and untracked-but-not-ignored changes included. The worktree form stages into a
 * copy of the index, never the real one. Null when none of the folders exists.
 */
export function currentTree(root, sources, { worktree = false } = {}) {
  if (!worktree) return sourcesTree(root, sources);
  const dir = mkdtempSync(join(tmpdir(), 'published-index-'));
  try {
    let real = gitIn(root, ['rev-parse', '--git-path', 'index']);
    if (!isAbsolute(real)) real = join(root, real);
    const index = join(dir, 'index');
    if (existsSync(real)) copyFileSync(real, index);
    const env = { GIT_INDEX_FILE: index };
    gitIn(root, ['add', '-A', '--', ...sources], env);
    return combineTrees(
      sources.map((source) => {
        try {
          return [source, gitIn(root, ['write-tree', `--prefix=${source}/`], env)];
        } catch {
          return [source, null];
        }
      }),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function readPublished(root) {
  const path = join(root, 'design', 'published.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
}

/** Every checked artifact whose tree differs from its recorded publish; empty when all match. */
export function publishedDrift({ root, worktree = false }) {
  const published = readPublished(root);
  const drift = [];
  for (const { artifact, sources } of readChecked(root)) {
    const recorded = published[artifact] ?? null;
    const committed = currentTree(root, sources);
    const entry = (reason, current = committed) => ({
      artifact,
      sources,
      recorded,
      current,
      reason,
    });
    const stale = recorded ? staleInstalls(artifact, recorded.installs, published) : [];
    if (!recorded) drift.push(entry('never published'));
    else if (committed !== recorded.tree) drift.push(entry('changed since the publish'));
    else if (stale.length) drift.push(entry(stale.join('; ')));
    else if (worktree) {
      const current = currentTree(root, sources, { worktree: true });
      if (current !== recorded.tree)
        drift.push(entry('uncommitted changes since the publish', current));
    }
  }
  return drift;
}

const short = (sha) => (sha ? sha.slice(0, 7) : 'none');

/** One message line per drift entry. */
export function describeDrift(drift) {
  return drift.map(
    (d) =>
      `${d.sources.join(', ')} (${d.artifact}): ${d.reason}; published tree ${short(d.recorded?.tree)}, now ${short(d.current)}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      options: { worktree: { type: 'boolean' }, root: { type: 'string' } },
    });
    const root = values.root ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
    const drift = publishedDrift({ root, worktree: values.worktree ?? false });
    if (!drift.length) {
      const names = readChecked(root).map((c) => c.artifact);
      console.log(`Published sources match design/published.json: ${names.join(', ')}`);
    } else {
      for (const line of describeDrift(drift)) console.error(line);
      console.error(
        'Render and publish them (docs/plan/README.md, Commands: the plan, pnpm sonora:build, pnpm canvas:build), then run record-publish.mjs and commit design/published.json.',
      );
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`published: ${error.message}`);
    process.exitCode = 2;
  }
}
