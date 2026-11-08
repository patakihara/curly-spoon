/**
 * Whether a medium's library folder can be used: a medium whose folder is missing, or that may not
 * look inside it, is not registered, and the rest of the server runs as ever.
 */
import { statSync } from 'node:fs';

/** What keeps the folder named `name` in MEDIA_DIR from being used, or null. */
export function folderLacking(path: string, name: string): string | null {
  try {
    return statSync(path, { throwIfNoEntry: false })?.isDirectory() === true
      ? null
      : `a ${name} folder in MEDIA_DIR`;
  } catch {
    return `a ${name} folder in MEDIA_DIR it may look inside`;
  }
}
