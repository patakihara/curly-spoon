import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KOTLIN_SONORA_PACKAGE } from './outputs.js';

/** The :sonora module's hand-written Sonora package, under `root` (the repo root). */
export const androidSonoraDir = (root: string) =>
  join(root, 'android/sonora/src/main/java', ...KOTLIN_SONORA_PACKAGE.split('.'));

/**
 * Every public Sonora component composable in `dir`, with the parameters it declares. The
 * module's own primitives, named `Sonora…` (`SonoraIcon`), are not Sonora components and are left
 * out: the gallery draws the icon font as a specimen of its own.
 */
export function androidComponents(dir: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.kt'))
    .sort()) {
    const source = readFileSync(join(dir, file), 'utf8');
    for (const m of source.matchAll(/^@Composable\s+fun (\w+)\(([^)]*)\)/gm))
      if (!m[1]!.startsWith('Sonora')) found.set(m[1]!, m[2]!.trim());
  }
  return found;
}
