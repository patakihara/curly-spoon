/**
 * Best-effort audio format hint parsed from a release title.
 *
 * Neither indexer's structured metadata reliably reports the container format — Prowlarr's
 * Newznab payload has no dedicated field, and AudiobookBay's listing page only sometimes
 * prints one — so both fall back to this. Tokens are matched on word-ish boundaries so
 * "mp3" matches "Book.mp3" and "[MP3 64kbps]" without also matching a substring buried
 * inside a longer word (e.g. "champ3x"). Priority order matters when a title advertises
 * more than one container ("M4B + MP3"): M4B is the one audiobook apps actually prefer
 * (embedded chapters, single file), so it wins.
 */
const FORMAT_TOKENS = ['m4b', 'flac', 'm4a', 'aac', 'ogg', 'opus', 'mp3'] as const;

export function detectFormat(title: string): string | null {
  const lower = title.toLowerCase();
  for (const token of FORMAT_TOKENS) {
    const boundary = new RegExp(`(?:^|[^a-z0-9])${token}(?:[^a-z0-9]|$)`);
    if (boundary.test(lower)) {
      return token;
    }
  }
  return null;
}
