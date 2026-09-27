/**
 * `pnpm gen`: the OpenAPI document and both clients, from the route declarations in schema/src.
 *
 *   tsx codegen/gen.ts [--src <dir with index.ts>] [--out <output root>]
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import type { Route } from '../src/routes.js';
import { generateKotlin } from './kotlin.js';
import { buildOpenApiDocument } from './openapi.js';
import { KOTLIN_PACKAGE, OUTPUTS } from './outputs.js';
import { generateTypeScript } from './typescript.js';

const { values } = parseArgs({
  options: {
    src: { type: 'string', default: fileURLToPath(new URL('../src', import.meta.url)) },
    out: { type: 'string', default: fileURLToPath(new URL('../..', import.meta.url)) },
  },
});
const src = resolve(values.src);
const out = resolve(values.out);

const { routes } = (await import(pathToFileURL(join(src, 'index.ts')).href)) as {
  routes: readonly Route[];
};

const json = `${JSON.stringify(buildOpenApiDocument(routes), null, 2)}\n`;
// Both clients come from exactly the bytes that are committed.
const doc = JSON.parse(json) as object;

const contents: Record<keyof typeof OUTPUTS, string> = {
  openapi: json,
  typescript: await generateTypeScript(doc),
  kotlin: generateKotlin(doc, KOTLIN_PACKAGE),
};

// Each output's folder belongs to this generator alone, so a stale file cannot survive a run.
for (const rel of Object.values(OUTPUTS)) {
  rmSync(dirname(join(out, rel)), { recursive: true, force: true });
}
for (const [key, rel] of Object.entries(OUTPUTS) as [keyof typeof OUTPUTS, string][]) {
  const file = join(out, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents[key]);
  process.stdout.write(`wrote ${rel}\n`);
}
