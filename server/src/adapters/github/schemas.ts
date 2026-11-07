/**
 * What GitHub's releases API says of a release, cut to what the extractor's update reads, and the
 * checksum file published beside its assets. A tag becomes a folder name, so only a version's form
 * passes: the date of a stable release, with a build number on a nightly's.
 */
import { z } from 'zod';

export const VERSION = /^\d{4}\.\d{2}\.\d{2}(?:\.\d+)?$/;

export const releaseSchema = z.object({
  tag_name: z.string().regex(VERSION),
  assets: z.array(
    z.object({
      name: z.string(),
      browser_download_url: z.string().url(),
      size: z.number().int().nonnegative(),
    }),
  ),
});
export type Release = z.infer<typeof releaseSchema>;

const SUM_LINE = /^([0-9a-f]{64}) +\*?(\S+)$/;

/** One file's SHA-256 in a `SHA2-256SUMS` text; undefined when the text does not name it. */
export function sumOf(text: string, file: string): string | undefined {
  for (const line of text.split('\n')) {
    const match = SUM_LINE.exec(line.trim());
    if (match?.[2] === file) return match[1];
  }
  return undefined;
}
