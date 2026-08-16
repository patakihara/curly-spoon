import { describe, expect, it } from 'vitest';
import {
  matchOwnership,
  type OwnershipIdentifiers,
  type OwnershipLibraryItem,
} from './ownership.js';

function libraryItem(
  id: string,
  title: string,
  authors: string[] = [],
  identifiers: OwnershipIdentifiers = {},
): OwnershipLibraryItem {
  return { id, title, authors, identifiers };
}

describe('matchOwnership', () => {
  it('returns owned on an exact ASIN match, naming the identifier', () => {
    const library = [libraryItem('lib-1', 'Mistborn', ['Brandon Sanderson'], { asin: 'B002ABC' })];
    const verdict = matchOwnership(
      { title: 'Mistborn', authors: ['Brandon Sanderson'], identifiers: { asin: 'B002ABC' } },
      library,
    );
    expect(verdict).toEqual({
      status: 'owned',
      libraryItemId: 'lib-1',
      reason: { kind: 'identifier', field: 'asin', value: 'B002ABC' },
    });
  });

  // The rule most likely to be got backwards: identical titles with different
  // ASINs are different editions/items, not the same one. A title heuristic
  // must never override this negative identifier match.
  it('returns new when the title matches but the ASIN differs — different editions are different items', () => {
    const library = [libraryItem('lib-1', 'Mistborn', ['Brandon Sanderson'], { asin: 'B002ABC' })];
    const verdict = matchOwnership(
      { title: 'Mistborn', authors: ['Brandon Sanderson'], identifiers: { asin: 'B002XYZ' } },
      library,
    );
    expect(verdict).toEqual({ status: 'new' });
  });

  // This is the test that fails if the strong-identifier comparison is
  // deleted from `comparePair`: with the identifier branch removed, this
  // pair falls straight into title/author matching (both match), which
  // wrongly returns `possible` — or even `owned` under a looser
  // implementation. The identifier check is the only thing standing between
  // this candidate and a false positive.
  it('does not fall through to a title match when identifiers actively disagree', () => {
    const library = [
      libraryItem('lib-1', 'Mistborn', ['Brandon Sanderson'], {
        asin: 'B002ABC',
        isbn: '9780765311788',
      }),
    ];
    const verdict = matchOwnership(
      { title: 'Mistborn', authors: ['Brandon Sanderson'], identifiers: { asin: 'B999DIFFERENT' } },
      library,
    );
    expect(verdict.status).toBe('new');
  });

  it('title+author match with no identifiers anywhere yields possible, never owned', () => {
    const library = [libraryItem('lib-1', 'Mistborn', ['Brandon Sanderson'])];
    const verdict = matchOwnership(
      { title: 'Mistborn', authors: ['Brandon Sanderson'], identifiers: {} },
      library,
    );
    expect(verdict).toEqual({
      status: 'possible',
      libraryItemId: 'lib-1',
      reason: { kind: 'title-author' },
    });
  });

  it('returns owned on a MusicBrainz album id match', () => {
    const library = [
      libraryItem('lib-album-1', 'The Dark Side of the Moon', ['Pink Floyd'], {
        musicBrainzAlbumId: 'mbid-album-123',
      }),
    ];
    const verdict = matchOwnership(
      {
        title: 'The Dark Side of the Moon',
        authors: ['Pink Floyd'],
        identifiers: { musicBrainzAlbumId: 'mbid-album-123' },
      },
      library,
    );
    expect(verdict).toEqual({
      status: 'owned',
      libraryItemId: 'lib-album-1',
      reason: { kind: 'identifier', field: 'musicBrainzAlbumId', value: 'mbid-album-123' },
    });
  });

  it('never matches an MBID against an ASIN, even with the same raw string value', () => {
    const sharedValue = 'B002ABC';
    const library = [libraryItem('lib-1', 'Some Album', [], { musicBrainzAlbumId: sharedValue })];
    const verdict = matchOwnership(
      { title: 'Some Album', authors: [], identifiers: { asin: sharedValue } },
      library,
    );
    // Different fields never compare to each other, so this falls through to
    // the title heuristic (title matches, authors both empty) -> possible,
    // never `owned` from a cross-namespace identifier "match".
    expect(verdict.status).toBe('possible');
    if (verdict.status === 'possible') {
      expect(verdict.reason.kind).toBe('title-author');
    }
  });

  it('a book and a podcast that happen to share an id string are not a match (namespacing)', () => {
    const sharedValue = 'shared-id-string';
    // The book's asin equals the podcast's feedUrl as a bare string.
    const library = [
      libraryItem('lib-podcast-1', 'Totally Different Podcast', [], { feedUrl: sharedValue }),
    ];
    const verdict = matchOwnership(
      { title: 'Some Audiobook', authors: [], identifiers: { asin: sharedValue } },
      library,
    );
    expect(verdict).toEqual({ status: 'new' });
  });

  it('matches at the possible level despite case and whitespace differences in the title', () => {
    const library = [libraryItem('lib-1', '  Mistborn  ', ['Brandon Sanderson'])];
    const verdict = matchOwnership(
      { title: 'MISTBORN', authors: ['brandon sanderson'], identifiers: {} },
      library,
    );
    expect(verdict.status).toBe('possible');
  });

  // Pins the conservative title normalization: no subtitle stripping. A
  // future "improvement" that starts stripping subtitles would make this
  // pass with 'possible', which is exactly the false-positive direction this
  // module's header warns against.
  it('does not match two titles differing only by a subtitle', () => {
    const library = [libraryItem('lib-1', 'Mistborn', ['Brandon Sanderson'])];
    const verdict = matchOwnership(
      { title: 'Mistborn: The Final Empire', authors: ['Brandon Sanderson'], identifiers: {} },
      library,
    );
    expect(verdict).toEqual({ status: 'new' });
  });

  it('returns new for two genuinely different titles', () => {
    const library = [libraryItem('lib-1', 'The Way of Kings', ['Brandon Sanderson'])];
    const verdict = matchOwnership(
      { title: 'The Name of the Wind', authors: ['Patrick Rothfuss'], identifiers: {} },
      library,
    );
    expect(verdict).toEqual({ status: 'new' });
  });

  it('returns new against an empty library', () => {
    const verdict = matchOwnership(
      { title: 'Anything', authors: ['Anyone'], identifiers: { asin: 'X' } },
      [],
    );
    expect(verdict).toEqual({ status: 'new' });
  });

  it('does not throw for a candidate with no identifiers and no authors', () => {
    const library = [libraryItem('lib-1', 'Something', [])];
    expect(() =>
      matchOwnership({ title: '', authors: [], identifiers: {} }, library),
    ).not.toThrow();
    const verdict = matchOwnership({ title: '', authors: [], identifiers: {} }, library);
    expect(verdict.status).toBe('new');
  });

  it('treats empty-string and null identifier values as absent, not as a match', () => {
    const library = [libraryItem('lib-1', 'Mistborn', [], { asin: '' })];
    const verdict = matchOwnership(
      { title: 'Something Else Entirely', authors: [], identifiers: { asin: null } },
      library,
    );
    expect(verdict).toEqual({ status: 'new' });
  });
});
