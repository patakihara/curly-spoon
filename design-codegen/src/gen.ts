/**
 * `pnpm gen`: the web UI package and the Android props classes, from Sonora's components.
 *
 *   tsx src/gen.ts [--sonora <Sonora dir>] [--out <output root>]
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { generateKotlin } from './kotlin.js';
import { KOTLIN_PACKAGE, OUTPUTS, SONORA_DIR } from './outputs.js';
import { readProps } from './props.js';
import { discoverComponents } from './sonora.js';
import { generateWeb } from './web.js';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const { values } = parseArgs({
  options: {
    sonora: { type: 'string', default: join(repoRoot, SONORA_DIR) },
    out: { type: 'string', default: repoRoot },
  },
});
const out = resolve(values.out);

const components = discoverComponents(resolve(values.sonora));
const outputs: Record<keyof typeof OUTPUTS, Map<string, string>> = {
  web: generateWeb(components),
  kotlin: generateKotlin(readProps(components), KOTLIN_PACKAGE),
};

// Both folders belong to this generator alone, so a stale file cannot survive a run.
for (const rel of Object.values(OUTPUTS)) rmSync(join(out, rel), { recursive: true, force: true });
for (const [key, files] of Object.entries(outputs) as [
  keyof typeof OUTPUTS,
  Map<string, string>,
][]) {
  for (const [path, content] of files) {
    const file = join(out, OUTPUTS[key], path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  process.stdout.write(`wrote ${files.size} files to ${OUTPUTS[key]}\n`);
}
