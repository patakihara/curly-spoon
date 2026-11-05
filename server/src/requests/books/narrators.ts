/**
 * The other narrations of a book among its author's folders, as `audiobook-narrator-tag` and
 * `audiobook-series-tag` found them. A sole copy stays plain. With a second, every copy's title takes
 * its narrator's last name, and no folder is renamed: the name already holds the narrator, and a move
 * is something Audiobookshelf would have to follow.
 */
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { JobLog } from '../../jobs/schedule.js';
import { readMetadata, writeMetadata } from './metadata.js';
import { lastNameOf, parseFolder, sameName, sameTitle } from './names.js';

/** The commands' own mark for a narrator nobody knows. */
export const UNKNOWN_NARRATOR = 'V';

export interface Copy {
  folder: string;
  /** The narrator named in the folder's name, if it names one. */
  narrator: string | null;
}

const TRAILING_BRACKET = /\s*\[([^\]]*)\]\s*$/;

/** The title without a trailing bracket, only when it names one of `marks`: any other is its own. */
function withoutMark(title: string, marks: readonly (string | null | undefined)[]): string {
  const bracket = TRAILING_BRACKET.exec(title)?.[1];
  if (bracket === undefined) return title;
  const ours = marks.some((mark) => mark && sameName(mark, bracket));
  return ours ? title.replace(TRAILING_BRACKET, '') : title;
}

/** The folders under an author holding this title, except `own`. A missing author folder has none. */
export async function otherCopies(authorDir: string, title: string, own: string): Promise<Copy[]> {
  const entries = await readdir(authorDir, { withFileTypes: true }).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });
  return entries.flatMap((entry) => {
    if (!entry.isDirectory() || entry.name === own) return [];
    const parsed = parseFolder(entry.name);
    const held = withoutMark(parsed.title, [parsed.narrator]);
    return sameTitle(held, title) ? [{ folder: entry.name, narrator: parsed.narrator }] : [];
  });
}

/** Marks each other copy's title with its narrator, keeping every other field. Never fails. */
export async function markCopies(
  authorDir: string,
  plainTitle: string,
  copies: readonly Copy[],
  log?: JobLog,
): Promise<void> {
  for (const { folder, narrator } of copies) {
    try {
      const path = join(authorDir, folder);
      const metadata = await readMetadata(path);
      if (metadata === null) continue;
      const named = metadata.narrators?.[0];
      const fromMetadata = named === undefined ? null : lastNameOf(named);
      const fromFolder = narrator && lastNameOf(narrator);
      const mark = fromMetadata ?? fromFolder;
      if (!mark || mark === UNKNOWN_NARRATOR) continue;
      const held = metadata.title ?? plainTitle;
      const title = `${withoutMark(held, [fromMetadata, fromFolder, narrator])} [${mark}]`;
      if (title !== metadata.title) await writeMetadata(path, { ...metadata, title });
    } catch (err) {
      log?.error({ err }, 'a second narration could not be marked on a sibling');
    }
  }
}

/**
 * One narration per series: another copy holding a tag keeps it, and this one has none. Without
 * `--force`, the command never overwrote a tag either.
 */
export async function seriesFor(
  authorDir: string,
  copies: readonly Copy[],
  series: readonly string[],
): Promise<string[]> {
  for (const { folder } of copies) {
    const metadata = await readMetadata(join(authorDir, folder));
    if ((metadata?.series ?? []).length > 0) return [];
  }
  return [...series];
}
