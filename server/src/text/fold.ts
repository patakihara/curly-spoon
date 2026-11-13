/**
 * Folding text for matching. One fold serves sign-in and search: NFKD, marks dropped,
 * lower-cased. Search folds a little further, so "dont" finds "Don't".
 */

/** NFKD, marks dropped, lower-cased: "Élise" and "ELISE" both fold to "elise". */
export function foldName(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Apostrophes and the marks typed for them: ' ’ ‘ ʼ ` ´ and the full-width '. */
const APOSTROPHES = /['’‘ʼ`´＇]/g;

/** Dashes MusicBrainz and torrents write differently: ‐ ‑ ‒ – — ― and the minus sign. */
const DASHES = /[\u2010-\u2015\u2212]/g;

/**
 * Apostrophes dropped and every dash a hyphen (before `foldName`, which would split ´ into a space and an accent), then
 * `foldName`, ß as ss, and whitespace collapsed: indexed text and queries alike. MusicBrainz writes
 * "Ghosts I–IV" with an en dash where torrents write a hyphen; both fold to "ghosts i-iv". Sign-in keeps
 * `foldName` alone: a login name matches an account only as spelled.
 */
export function searchFold(text: string): string {
  return foldName(text.replace(APOSTROPHES, '').replace(DASHES, '-'))
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Words in brackets: "(2002 Remaster)", "[Live]", "{feat. …}". */
const BRACKETED = /\s*[([{][^)\]}]*[)\]}]/g;
/** A dash's edition: "Song - 2002 Remaster", "Song - Radio Edit". */
const EDITION = /\s+-\s+.*(?:remaster|version|edit|mono|stereo|mix|live).*$/i;

/**
 * A song's title as written, its brackets and its dash's edition dropped, case and apostrophes
 * kept: what is sent to a catalogue that matches words only as spelled, such as MusicBrainz.
 */
export function plainTitle(title: string): string {
  return title.replace(BRACKETED, '').replace(EDITION, '').replace(/\s+/g, ' ').trim();
}

/** A song's title for comparing: folded for search, its brackets and its dash's edition dropped. */
export function titleKey(title: string): string {
  return searchFold(title).replace(BRACKETED, '').replace(EDITION, '').trim();
}

/**
 * Letters, numbers and private-use characters make words; everything else separates them. Search
 * rows hold these words space-joined, so the full-text index's unicode61 tokenizer sees nothing
 * else, and keeps each word whole except at 21 letters its tables class as spacing marks: New Tai
 * Lue U+19B0-19C0 and U+19C8-19C9, Vedic U+1CF2-1CF3 (SQLite 3.53.4). A title holding one is one
 * word to the title tiers and two to the full-text index, so a query for its second half finds it
 * by its words (tier 2).
 */
const NON_TOKEN = /[^\p{L}\p{N}\p{Co}]+/u;

/** The words of `text`, folded for search, as the full-text index holds them. */
export function searchTokens(text: string): string[] {
  return searchFold(text)
    .split(NON_TOKEN)
    .filter((token) => token !== '');
}
