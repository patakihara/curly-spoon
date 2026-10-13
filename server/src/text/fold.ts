/**
 * Folding text for matching. One fold serves sign-in and search: NFKD, marks dropped,
 * lower-cased. Search folds a little further, so "dont" finds "Don't".
 */

/** NFKD, marks dropped, lower-cased: "Élise" and "ELISE" both fold to "elise". */
export function foldName(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

const APOSTROPHES = /['’]/g;

/** `foldName`, then apostrophes dropped and whitespace collapsed: indexed text and queries alike. */
export function searchFold(text: string): string {
  return foldName(text).replace(APOSTROPHES, '').replace(/\s+/g, ' ').trim();
}

/**
 * Letters, numbers and private-use characters make words, as the full-text index's unicode61
 * tokenizer splits them; everything else separates them.
 */
const NON_TOKEN = /[^\p{L}\p{N}\p{Co}]+/u;

/** The words of `text`, folded for search, as the full-text index holds them. */
export function searchTokens(text: string): string[] {
  return searchFold(text)
    .split(NON_TOKEN)
    .filter((token) => token !== '');
}
