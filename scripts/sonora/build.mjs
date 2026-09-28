/**
 * `pnpm sonora:build`: the Sonora Design System artifact, built from design/sonora by its own
 * docs/build_bundle.js and docs/build_artifact.js into build/sonora: `project/**` is what the
 * orchestrator publishes, `canvas/tokens.css` what the canvas build installs beside it, and
 * `stamp.json` what record-publish.mjs records. Refuses uncommitted changes to design/sonora
 * unless --draft.
 *
 * CLI: node scripts/sonora/build.mjs [--out build/sonora] [--draft] [--root <dir>]
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildStamp } from '../plan/record-publish.mjs';

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: 'build/sonora' },
    draft: { type: 'boolean', default: false },
    root: { type: 'string' },
  },
});
const root = resolve(values.root ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'));
const out = resolve(root, values.out);

let stamp;
try {
  stamp = buildStamp({ root, artifact: 'sonora', draft: values.draft });
} catch (error) {
  console.error(`sonora:build: ${error.message}`);
  process.exit(1);
}
const docs = join(root, 'design/sonora/docs');
for (const args of [['build_bundle.js'], ['build_artifact.js', '--out', out]]) {
  execFileSync(process.execPath, [join(docs, args[0]), ...args.slice(1)], {
    cwd: join(root, 'design/sonora'),
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}
writeFileSync(join(out, 'stamp.json'), `${JSON.stringify(stamp, null, 2)}\n`);

const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
const project = files(join(out, 'project'));
const bytes = project.reduce((sum, f) => sum + statSync(f).size, 0);
console.log(
  `${relative(root, out)}/project: ${project.length} files, ${(bytes / 1024).toFixed(0)} KiB`,
);
console.log(`${relative(root, join(out, 'stamp.json'))}: ${JSON.stringify(stamp)}`);
