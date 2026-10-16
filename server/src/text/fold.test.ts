import { describe, expect, it } from 'vitest';
import { foldName, searchFold, searchTokens } from './fold.js';

describe('folding text for search', () => {
  it('drops accents, case and apostrophes, and collapses whitespace', () => {
    expect(searchFold("Émile Zola's")).toBe('emile zolas');
    expect(searchFold('  Don’t   Stop\tNow ')).toBe('dont stop now');
  });

  it('drops every form of apostrophe, and folds ß to ss', () => {
    for (const typed of ["don't", 'don’t', 'don‘t', 'donʼt', 'don`t', 'don´t']) {
      expect(searchFold(typed), typed).toBe('dont');
    }
    expect(searchFold('Straße STRASSE ẞ')).toBe('strasse strasse ss');
  });

  it('leaves the sign-in fold matching login names as they are spelled: ß and apostrophes stay', () => {
    expect(foldName('Straße')).toBe('straße');
    expect(foldName('O’Brien')).toBe('o’brien');
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

  it('folds compatibility forms to plain letters and digits', () => {
    expect(searchFold('ＦＵＬＬ ﬁve ²')).toBe('full five 2');
  });

  it('keeps a private-use character inside its word, as the full-text index does', () => {
    expect(searchTokens('Logo\uF8FFMark Live')).toEqual(['logo\uF8FFmark', 'live']);
  });
});
