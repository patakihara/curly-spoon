/**
 * Where a new show goes: its own folder in the Podcasts library's, named by its title as ABS's own
 * web app names it, less the characters a folder name refuses. When an item already sits there
 * (ABS answers `Podcast already exists`), the next of ` (2)` and ` (3)` is tried.
 */
import { posix } from 'node:path';

/** Every household show checks its feed on the hour; a new one does the same. */
export const PODCAST_SCHEDULE = '0 * * * *';

/** The longest folder name made. */
export const MOST_FOLDER_CHARS = 120;

/** The folder name for a show's title. */
export function podcastFolderName(title: string): string {
  const name = title
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/^[.\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MOST_FOLDER_CHARS)
    .trim();
  return name === '' ? 'Podcast' : name;
}

/** The paths tried for a show, in order. */
export function podcastPaths(folder: string, title: string): string[] {
  const name = podcastFolderName(title);
  return [name, `${name} (2)`, `${name} (3)`].map((one) => posix.join(folder, one));
}
