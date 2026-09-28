/**
 * People's names the recording scan checks for besides those seen while recording: a local file,
 * never committed, one name per line (`#` starts a comment). `AURALIS_NAMES_FILE` names it, else
 * `~/.config/auralis/names.txt`. No file means no extra names.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function localNamesFile(env: Record<string, string | undefined>, home: string): string {
  const set = env.AURALIS_NAMES_FILE;
  return set !== undefined && set !== '' ? set : join(home, '.config', 'auralis', 'names.txt');
}

export function localNames(env: Record<string, string | undefined>, home: string): string[] {
  const file = localNamesFile(env, home);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}
