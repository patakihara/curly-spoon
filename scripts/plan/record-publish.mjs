/**
 * Records an artifact publish in design/published.json: one key per artifact, holding only its
 * latest publish (git history is the record). The orchestrator runs it after publishing.
 *
 * CLI: node scripts/plan/record-publish.mjs --artifact plan --url <url> --version <v> --stamp build/plan/stamp.json [--root <dir>]
 * The stamps: build/plan/stamp.json, build/sonora/stamp.json, build/canvas/stamp.json.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

/**
 * The folders each artifact is generated from. The plan page shows the outbox, so an outbox
 * change needs a republish too. The merge check compares `sourcesTree` to the recorded `tree`.
 */
export const SOURCES = {
  plan: ['docs/plan', 'docs/outbox'],
  sonora: ['design/sonora'],
  canvas: ['design/app'],
};

/**
 * The published artifacts each artifact installs a copy of: the canvas installs Sonora's bundle.
 * A publish records the version it installed; the merge check requires it to be the current one.
 */
export const INSTALLS = {
  canvas: ['sonora'],
};

/** Why `installs` (artifact to version) differs from the current publishes, or [] when it does not. */
export function staleInstalls(artifact, installs, published) {
  return (INSTALLS[artifact] ?? [])
    .filter((dep) => (installs?.[dep] ?? null) !== (published[dep]?.version ?? null))
    .map(
      (dep) =>
        `installs ${dep} ${installs?.[dep] ?? 'none'}, but ${dep} is published at ${published[dep]?.version ?? 'none'}`,
    );
}

/**
 * One hash for an artifact's folders: sha1 over a `<path> <git tree|none>` line per folder, so
 * it changes exactly when one of the folders does. Null when none of the folders exists.
 */
export function combineTrees(trees) {
  if (trees.every(([, tree]) => !tree)) return null;
  const lines = trees.map(([path, tree]) => `${path} ${tree ?? 'none'}\n`).join('');
  return createHash('sha1').update(lines).digest('hex');
}

/** The combined tree of `paths` at `rev` (default HEAD) in the repo at `root`. */
export function sourcesTree(root, paths, rev = 'HEAD') {
  return combineTrees(
    paths.map((path) => {
      try {
        const tree = execFileSync('git', ['rev-parse', `${rev}:${path}`], {
          cwd: root,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        return [path, tree];
      } catch {
        return [path, null];
      }
    }),
  );
}

/**
 * The stamp a build writes beside its output for recordPublish: the commit, the combined tree of
 * the artifact's sources and whether it is a draft. Uncommitted changes to the sources are refused
 * unless `draft`, and a draft stamp is never recorded.
 */
export function buildStamp({ root, artifact, draft = false, now = new Date() }) {
  const sources = SOURCES[artifact];
  if (!sources) throw new Error(`unknown artifact "${artifact}"`);
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const dirty = git('status', '--porcelain', '--', ...sources).trimEnd();
  if (dirty && !draft) {
    throw new Error(`uncommitted changes (use --draft to build them anyway):\n${dirty}`);
  }
  return {
    commit: git('rev-parse', 'HEAD').trim(),
    tree: sourcesTree(root, sources),
    builtAt: now.toISOString(),
    draft,
  };
}

export function recordPublish({ root, artifact, url, version, stamp, now = new Date() }) {
  const sources = SOURCES[artifact];
  if (!sources)
    throw new Error(`unknown artifact "${artifact}"; one of ${Object.keys(SOURCES).join(', ')}`);
  if (stamp.draft) throw new Error('the stamp is from a --draft render; publish a clean render');
  if (!stamp.commit || !stamp.tree) throw new Error('the stamp has no commit or tree');
  const path = join(root, 'design', 'published.json');
  const published = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const installs = INSTALLS[artifact]
    ? Object.fromEntries(INSTALLS[artifact].map((dep) => [dep, stamp[dep]?.version ?? null]))
    : undefined;
  const stale = staleInstalls(artifact, installs, published);
  if (stale.length) throw new Error(`the stamp ${stale.join('; ')}; rebuild it`);
  published[artifact] = {
    url,
    sources,
    commit: stamp.commit,
    tree: stamp.tree,
    version: String(version),
    ...(installs && { installs }),
    publishedAt: now.toISOString(),
  };
  const sorted = Object.fromEntries(
    Object.keys(published)
      .sort()
      .map((k) => [k, published[k]]),
  );
  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`);
  return sorted[artifact];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      artifact: { type: 'string' },
      url: { type: 'string' },
      version: { type: 'string' },
      stamp: { type: 'string' },
      root: { type: 'string' },
    },
  });
  if (!values.artifact || !values.url || !values.version || !values.stamp) {
    console.error(
      'usage: record-publish.mjs --artifact plan --url <url> --version <v> --stamp build/plan/stamp.json',
    );
    process.exit(2);
  }
  const root = resolve(
    values.root ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
  );
  const stamp = JSON.parse(readFileSync(resolve(root, values.stamp), 'utf8'));
  try {
    const entry = recordPublish({
      root,
      artifact: values.artifact,
      url: values.url,
      version: values.version,
      stamp,
    });
    console.log(`design/published.json: ${values.artifact} → ${JSON.stringify(entry)}`);
  } catch (err) {
    console.error(`record-publish: ${err.message}`);
    process.exit(1);
  }
}
