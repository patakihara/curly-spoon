import { describe, expect, it } from 'vitest';
import { deriveSearchSuggestions, type SearchSuggestionSources } from './searchSuggestions.js';

function sources(overrides: Partial<SearchSuggestionSources> = {}): SearchSuggestionSources {
  return {
    books: [],
    series: [],
    authors: [],
    podcasts: [],
    artists: [],
    albums: [],
    tracks: [],
    ...overrides,
  };
}

describe('deriveSearchSuggestions', () => {
  it('formats the label as "{title} · {Kind}" with the U+00B7 middle dot separator', () => {
    const result = deriveSearchSuggestions(sources({ books: [{ id: 'b1', title: 'Dune' }] }));
    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe('Dune · Book');
  });

  it('matches the literal example strings the spec pins', () => {
    const result = deriveSearchSuggestions(
      sources({
        podcasts: [{ id: 'p1', title: 'The Daily Tech Brief' }],
        authors: [{ id: 'a1', title: 'Frank Herbert' }],
        artists: [{ id: 'ar1', title: 'Nebula Prime' }],
        albums: [{ id: 'al1', title: 'Static Bloom' }],
      }),
    );
    const labels = result.map((r) => r.label);
    expect(labels).toEqual([
      'Frank Herbert · Author',
      'The Daily Tech Brief · Podcast',
      'Nebula Prime · Artist',
      'Static Bloom · Album',
    ]);
  });

  it('orders suggestions Books, Series, Authors, Podcasts, Artists, Albums, Tracks regardless of input order', () => {
    // Populate every kind at once and confirm the fixed order wins, not the
    // order the fields happen to be listed in the input object.
    const result = deriveSearchSuggestions(
      sources({
        tracks: [{ id: 't1', title: 'Track', albumId: 'alb1' }],
        albums: [{ id: 'al1', title: 'Album' }],
        artists: [{ id: 'ar1', title: 'Artist' }],
        podcasts: [{ id: 'p1', title: 'Podcast' }],
        authors: [{ id: 'a1', title: 'Author' }],
        series: [{ id: 's1', title: 'Series' }],
        books: [{ id: 'b1', title: 'Book' }],
      }),
    );
    expect(result.map((r) => r.kind)).toEqual([
      'Book',
      'Series',
      'Author',
      'Podcast',
      'Artist',
      'Album',
      'Track',
    ]);
  });

  it('caps the total at 8 across all kinds combined, stopping mid-kind if necessary', () => {
    const result = deriveSearchSuggestions(
      sources({
        books: Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, title: `Book ${i}` })),
        podcasts: Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, title: `Podcast ${i}` })),
      }),
    );
    expect(result).toHaveLength(8);
    // 5 books fully included, then 3 of the 5 podcasts, not fewer than 8 total
    // just because books came first.
    expect(result.filter((r) => r.kind === 'Book')).toHaveLength(5);
    expect(result.filter((r) => r.kind === 'Podcast')).toHaveLength(3);
  });

  it('does not reserve slots for a kind with no candidates', () => {
    // No series/authors at all — a platform (or a query) missing a kind should
    // still get up to 8 suggestions from the kinds it does have.
    const result = deriveSearchSuggestions(
      sources({
        books: Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, title: `Book ${i}` })),
      }),
    );
    expect(result).toHaveLength(8);
    expect(result.every((r) => r.kind === 'Book')).toBe(true);
  });

  it('carries the album id for a track suggestion, since its navigation target is the album, not itself', () => {
    const result = deriveSearchSuggestions(
      sources({ tracks: [{ id: 'trk1', title: 'Some Track', albumId: 'alb-99' }] }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'Track', originalId: 'trk1', albumId: 'alb-99' });
  });

  it('produces a unique id per suggestion even if two different kinds share the same underlying id', () => {
    // A book and an artist could coincidentally have the same upstream id —
    // the kind prefix must keep them distinct as React keys / activedescendant targets.
    const result = deriveSearchSuggestions(
      sources({
        books: [{ id: 'shared-1', title: 'Dune' }],
        artists: [{ id: 'shared-1', title: 'Pink Floyd' }],
      }),
    );
    const ids = result.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns an empty list for an empty query with no candidates anywhere', () => {
    expect(deriveSearchSuggestions(sources())).toEqual([]);
  });
});
