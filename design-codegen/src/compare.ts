/**
 * The visual comparison of each canvas page, `design/app/compare/<id>.md` beside
 * `compare/<id>/canvas-{phone,desktop}.png`: the page's renders set against the Sonora UI kit
 * renders it names (captured once under `compare/sonora/`), with the differences listed and the
 * hash of the page it was made from. The kits are the design; a Spotify screen is only ever
 * consulted for intent where a kit lacks something, and is never compared against.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { SonoraSource, type NavPage } from './nav.js';
import { parsePage, type PageTree } from './page.js';

/** A Sonora component's source file, `components/<folder>/<Name>.jsx`; undefined if none. */
export function componentFile(sonoraDir: string, name: string): string | undefined {
  const root = join(sonoraDir, 'components');
  for (const folder of readdirSync(root).sort()) {
    const file = join(root, folder, `${name}.jsx`);
    if (existsSync(file)) return file;
  }
  return undefined;
}

/** The components a source reaches for: `NS().X`, `const { X, Y } = NS()` and `./X.jsx` imports. */
function references(source: string): string[] {
  const names = [...source.matchAll(/NS\(\)\.([A-Z]\w*)/g)].map((m) => m[1]!);
  for (const m of source.matchAll(/const\s*\{([^}]*)\}\s*=\s*NS\(\)/g)) {
    names.push(...m[1]!.split(',').map((n) => n.trim().split(/\s*:\s*/)[0]!));
  }
  for (const m of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/[A-Z]\w*\.jsx'/g)) {
    names.push(...m[1]!.split(',').map((n) => n.trim()));
  }
  return names.filter((n) => /^[A-Z]\w*$/.test(n));
}

/** `names` and every Sonora component they reach, transitively, sorted. */
export function usedComponents(sonoraDir: string, names: string[]): string[] {
  const seen = new Set<string>();
  const queue = [...names];
  while (queue.length > 0) {
    const name = queue.pop()!;
    if (seen.has(name)) continue;
    const file = componentFile(sonoraDir, name);
    if (file === undefined) continue;
    seen.add(name);
    queue.push(...references(readFileSync(file, 'utf8')));
  }
  return [...seen].sort();
}

function drawn(tree: PageTree, into: Set<string>): Set<string> {
  if (tree.kind === 'element') into.add(tree.component);
  if ('children' in tree) tree.children.forEach((child) => drawn(child, into));
  return into;
}

/**
 * sha256 of the page file, its placeholder and the source of every Sonora component it draws
 * with, directly or through their lookups, so a change to any of them asks for a fresh look.
 */
export function pageHash(appDir: string, sonoraDir: string, id: string): string {
  const page = readFileSync(join(appDir, 'pages', `${id}.page.jsx`), 'utf8');
  const hash = createHash('sha256')
    .update(page)
    .update('\0')
    .update(readFileSync(join(appDir, 'placeholders', `${id}.json`)));
  for (const name of usedComponents(sonoraDir, [...drawn(parsePage(page, id), new Set())])) {
    hash.update(`\0${name}\0`).update(readFileSync(componentFile(sonoraDir, name)!));
  }
  return hash.digest('hex');
}

/** The committed image of a Sonora source, relative to `compare/`; none for `none`. */
export function sonoraShot(source: string): string | undefined {
  if (source === 'none') return undefined;
  return `sonora/${source.replace(':', '-').replace('/', '-')}.png`;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A PNG's pixel size, read from its header; undefined when it is not a whole PNG. */
export function pngSize(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(SIGNATURE)) return undefined;
  if (bytes.toString('latin1', 12, 16) !== 'IHDR') return undefined;
  if (bytes.toString('latin1', bytes.length - 8, bytes.length - 4) !== 'IEND') return undefined;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

const FrontMatter = z
  .object({
    page: z.string(),
    pageHash: z.string().regex(/^[0-9a-f]{64}$/),
    sonora: z.array(SonoraSource),
    /** Spotify screens consulted for intent, where the kit lacks something. */
    spotify: z.array(z.string()).optional(),
  })
  .strict();

/** Splits a comparison into its YAML front matter and its body. */
export function readComparison(text: string): { front: unknown; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (match === null) return { front: undefined, body: text };
  return { front: parseYaml(match[1]!), body: match[2]! };
}

/** What is wrong with a page's comparison, empty when nothing is. */
export function checkComparison(appDir: string, sonoraDir: string, page: NavPage): string[] {
  const errors: string[] = [];
  const say = (message: string) => errors.push(`${page.id}: ${message}`);
  const md = join(appDir, 'compare', `${page.id}.md`);
  if (!existsSync(md)) {
    say(`compare/${page.id}.md is missing`);
    return errors;
  }
  const { front, body } = readComparison(readFileSync(md, 'utf8'));
  const parsed = FrontMatter.safeParse(front);
  if (!parsed.success) {
    say(
      `compare/${page.id}.md front matter: ${parsed.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`,
    );
    return errors;
  }
  const meta = parsed.data;
  if (meta.page !== page.id) say(`compare/${page.id}.md names page ${meta.page}`);
  if (meta.sonora.join() !== page.sources.sonora.join()) {
    say(
      `compare/${page.id}.md names Sonora sources [${meta.sonora}], nav.json [${page.sources.sonora}]`,
    );
  }
  const known = readFileSync(join(sonoraDir, 'docs/screens/README.md'), 'utf8');
  for (const id of meta.spotify ?? []) {
    if (!new RegExp(`\\b${id}\\b`).test(known)) say(`${id} is not a reference screen`);
  }
  const images = [
    `${page.id}/canvas-phone.png`,
    `${page.id}/canvas-desktop.png`,
    ...page.sources.sonora.flatMap((s) => sonoraShot(s) ?? []),
  ];
  for (const rel of images) {
    const file = join(appDir, 'compare', rel);
    if (!existsSync(file)) say(`compare/${rel} is missing`);
    else if (pngSize(readFileSync(file)) === undefined) say(`compare/${rel} is not a PNG`);
  }
  const differences = /^## Differences\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body)?.[1] ?? '';
  if (!/^- \S/m.test(differences)) {
    say(`compare/${page.id}.md lists no differences (write - none if there are none)`);
  }
  if (meta.pageHash !== pageHash(appDir, sonoraDir, page.id)) {
    say(`the page changed since compare/${page.id}.md was made; look again`);
  }
  return errors;
}
