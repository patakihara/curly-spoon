/**
 * Run export/generate.js — the project's own generator — outside the Claude Design app.
 *
 * generate.js is written for the app's `run_script` sandbox, which hands it
 * `{ readFile, saveFile, ls, log }`. This supplies the same four against the local mirror so the
 * export can be regenerated here. The generator itself is untouched: reimplementing what it does
 * would be a second source of truth, and the whole point of an "everything here is derived" file
 * is that there is exactly one.
 *
 *   node docs/run_generate.mjs
 */
import { readFile as read, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const abs = (p) => path.join(ROOT, p);

const env = {
  readFile: (p) => read(abs(p), 'utf8'),
  saveFile: async (p, content) => {
    await mkdir(path.dirname(abs(p)), { recursive: true });
    await writeFile(abs(p), content);
    written.push(p);
  },
  // The generator calls ls('components/<dir>') and filters for /\.d\.ts$/, so it wants bare names.
  ls: (p) => readdir(abs(p)),
  log: (m) => console.log('  ' + m),
};

const written = [];
const src = await read(abs('export/generate.js'), 'utf8');
const generateExport = new Function(src + '; return generateExport;')();
await generateExport(env);
console.log('wrote: ' + written.join(', '));
