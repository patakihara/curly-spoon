/**
 * Records an artifact publish in design/published.json: one key per artifact, holding only its
 * latest publish (git history is the record). The orchestrator runs it after publishing.
 *
 * CLI: node scripts/plan/record-publish.mjs --artifact plan --url <url> --version <v> --stamp build/plan/stamp.json [--root <dir>]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

/** The folder each artifact is generated from; the merge check compares its tree to `tree`. */
export const SOURCES = { plan: 'docs/plan', sonora: 'design/sonora', canvas: 'design/app' };

export function recordPublish({ root, artifact, url, version, stamp, now = new Date() }) {
  const source = SOURCES[artifact];
  if (!source)
    throw new Error(`unknown artifact "${artifact}"; one of ${Object.keys(SOURCES).join(', ')}`);
  if (stamp.draft) throw new Error('the stamp is from a --draft render; publish a clean render');
  if (!stamp.commit || !stamp.tree) throw new Error('the stamp has no commit or tree');
  const path = join(root, 'design', 'published.json');
  const published = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  published[artifact] = {
    url,
    source,
    commit: stamp.commit,
    tree: stamp.tree,
    version: String(version),
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
