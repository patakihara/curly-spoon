import { describe, expect, it } from 'vitest';
import { foldName, searchFold, searchTokens } from './fold.js';

describe('folding text for search', () => {
  it('drops accents, case and apostrophes, and collapses whitespace', () => {
    expect(searchFold("Émile Zola's")).toBe('emile zolas');
    expect(searchFold('  Don’t   Stop\tNow ')).toBe('dont stop now');
  });

  it('agrees with the sign-in fold on letters, case and accents', () => {
    for (const name of ['Élise', 'KARA', 'Ångström', 'Dvořák', 'ﬁnal', 'Ｗｉｄｅ', 'Ølstykke']) {
      expect(searchFold(name), name).toBe(foldName(name));
    }
  });

  it('splits a query into tokens where the index splits words', () => {
    expect(searchTokens("The Saltwater Diaries: Don't Panic")).toEqual([
      'the',
      'saltwater',
      'diaries',
      'dont',
      'panic',
    ]);
    expect(searchTokens('AC/DC — Live!')).toEqual(['ac', 'dc', 'live']);
    expect(searchTokens(' ,; ')).toEqual([]);
  });
});
