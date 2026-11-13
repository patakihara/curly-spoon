import { describe, expect, it } from 'vitest';
import { foldName, plainTitle, searchFold, searchTokens, titleKey } from './fold.js';

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

  it('[M3.albums] folds every dash to a hyphen, so "Ghosts I–IV" matches a torrent\'s "Ghosts I-IV"', () => {
    for (const typed of [
      'Ghosts I–IV',
      'Ghosts I—IV',
      'Ghosts I‐IV',
      'Ghosts I‑IV',
      'Ghosts I−IV',
    ]) {
      expect(searchFold(typed), typed).toBe('ghosts i-iv');
    }
    expect(titleKey('Dreams – 2004 Remaster')).toBe(titleKey('Dreams'));
    expect(searchTokens('Ghosts I–IV')).toEqual(searchTokens('Ghosts I-IV'));
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

  it('[M3.keep] a title sent as written keeps its case and apostrophe and drops its brackets and edition', () => {
    expect(plainTitle('Not Gonna Give It Up (2002 Remaster)')).toBe('Not Gonna Give It Up');
    expect(plainTitle("I'm Never Gonna Give You Up [Live]")).toBe("I'm Never Gonna Give You Up");
    expect(plainTitle('Dreams - 2004 Remaster')).toBe('Dreams');
  });

  it('[M3.keep] a title compared folds as search does, its brackets and edition dropped', () => {
    expect(titleKey('I’m Never Gonna Give You Up (feat. X)')).toBe(
      titleKey("I'm never gonna give you up"),
    );
    expect(titleKey('Dreams - 2004 Remaster')).toBe('dreams');
  });
});
