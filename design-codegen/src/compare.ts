/**
 * The visual comparison of each canvas page, `design/app/compare/<id>.md` beside
 * `compare/<id>/canvas-{phone,desktop}.png`: the page's renders set against the Sonora screens and
 * cards it names (committed once under `compare/sonora/`) and its Spotify references, with the
 * differences listed and the hash of the page it was made from.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { SonoraSource, type NavPage } from './nav.js';

/** sha256 of the page file and its placeholder, so a changed page asks for a fresh look. */
export function pageHash(appDir: string, id: string): string {
  return createHash('sha256')
    .update(readFileSync(join(appDir, 'pages', `${id}.page.jsx`)))
    .update('\0')
    .update(readFileSync(join(appDir, 'placeholders', `${id}.json`)))
    .digest('hex');
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

const list = z.preprocess(
  (v) =>
    typeof v === 'string'
      ? v
          .replace(/^\[|\]$/g, '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : v,
  z.array(z.string()),
);

const FrontMatter = z
  .object({
    page: z.string(),
    pageHash: z.string().regex(/^[0-9a-f]{64}$/),
    sonora: list.pipe(z.array(SonoraSource)),
    spotify: list,
  })
  .strict();

/** Splits a comparison into its front matter (`key: value` lines) and its body. */
export function readComparison(text: string): { front: unknown; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (match === null) return { front: undefined, body: text };
  const front: Record<string, string> = {};
  for (const line of match[1]!.split('\n')) {
    const at = line.indexOf(':');
    if (at > 0) front[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return { front, body: match[2]! };
}

/** What is wrong with a page's comparison, empty when nothing is. */
export function checkComparison(appDir: string, page: NavPage, screensReadme: string): string[] {
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
  if (meta.spotify.join() !== page.sources.spotify.join()) {
    say(
      `compare/${page.id}.md names Spotify screens [${meta.spotify}], nav.json [${page.sources.spotify}]`,
    );
  }
  const known = readFileSync(screensReadme, 'utf8');
  for (const id of meta.spotify) {
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
  if (meta.pageHash !== pageHash(appDir, page.id)) {
    say(`the page changed since compare/${page.id}.md was made; look again`);
  }
  return errors;
}
