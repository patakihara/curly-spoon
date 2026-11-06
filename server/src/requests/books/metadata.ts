/**
 * The `metadata.json` Audiobookshelf reads from a book's folder, where it wins over everything else
 * the library's precedence lists. It holds no chapters, so Audiobookshelf reads its own.
 */
import { randomBytes } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

const METADATA_FILE = 'metadata.json';

export interface BookMetadata {
  title: string;
  authors: string[];
  narrators: string[];
  series: string[];
  publishedYear: string | null;
  asin: string | null;
  language: string | null;
  description: string | null;
  tags: string[];
  genres: string[];
}

/** What is read of a folder's own file; everything else in it stays as it is. */
const shelfMetadataSchema = z
  .object({
    title: z.string().optional(),
    narrators: z.array(z.string()).optional(),
    series: z.array(z.string()).optional(),
  })
  .passthrough();
export type ShelfMetadata = z.infer<typeof shelfMetadataSchema>;

/** A folder's `metadata.json`, or null if it has none that can be read. */
export async function readMetadata(folder: string): Promise<ShelfMetadata | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(folder, METADATA_FILE), 'utf8'));
    return shelfMetadataSchema.parse(parsed);
  } catch {
    return null;
  }
}

/** Writes a folder's `metadata.json` whole or not at all, and never into a file it links to. */
export async function writeMetadata(folder: string, metadata: object): Promise<void> {
  const temporary = join(folder, `.${METADATA_FILE}.${randomBytes(6).toString('hex')}`);
  try {
    await writeFile(temporary, `${JSON.stringify(metadata, null, 2)}\n`);
    await rename(temporary, join(folder, METADATA_FILE));
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}
