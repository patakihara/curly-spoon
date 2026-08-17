import { describe, expect, it } from 'vitest';
import type { Artist } from '@auralis/jellyfin-client';
import type { ExternalCandidate } from './external/types.js';
import { matchOwnership } from './ownership.js';
import {
  artistToOwnershipLibraryItem,
  externalCandidateToAlbumPlaceholder,
  externalCandidateToOwnershipItem,
  reasonForExternalShelf,
} from './musicExternalDiscovery.js';

function fakeArtist(overrides: Partial<Artist> = {}): Artist {
  return {
    id: 'artist-real-1',
    name: 'Real Artist',
    overview: null,
    imageTag: null,
    albumCount: 3,
    favorite: false,
    playCount: 0,
    lastPlayedAt: null,
    musicBrainzArtistId: null,
    ...overrides,
  };
}

function fakeCandidate(overrides: Partial<ExternalCandidate> = {}): ExternalCandidate {
  return {
    providerName: 'listenbrainz',
    providerId: 'mbid-similar-1',
    medium: 'music',
    title: 'Similar Artist',
    authors: [],
    genres: [],
    identifiers: {},
    reason: 'Similar to Real Artist',
    ...overrides,
  };
}

describe('artist-granularity ownership: matchOwnership over the adapted shapes', () => {
  it('exact MBID match: an external candidate carrying the same musicBrainzArtistId as a real Jellyfin artist is owned', () => {
    const library = [
      artistToOwnershipLibraryItem(
        fakeArtist({
          id: 'artist-nebula',
          name: 'The Nebula Collective',
          musicBrainzArtistId: 'mbid-nebula',
        }),
      ),
    ];
    const candidate = fakeCandidate({
      title: 'The Nebula Collective (different casing in the catalogue)',
      identifiers: { musicBrainzArtistId: 'mbid-nebula' },
    });

    const verdict = matchOwnership(externalCandidateToOwnershipItem(candidate), library);

    expect(verdict).toEqual({
      status: 'owned',
      libraryItemId: 'artist-nebula',
      reason: { kind: 'identifier', field: 'musicBrainzArtistId', value: 'mbid-nebula' },
    });
  });

  it("title-only near match: neither side has an MBID, but the normalized names agree — possible, not owned, and the caller must treat it the same as owned for filtering (ownership.ts's own guidance)", () => {
    const library = [
      artistToOwnershipLibraryItem(fakeArtist({ id: 'artist-echo', name: 'Echo Fields' })),
    ];
    const candidate = fakeCandidate({ title: '  echo fields  ', identifiers: {} });

    const verdict = matchOwnership(externalCandidateToOwnershipItem(candidate), library);

    expect(verdict).toEqual({
      status: 'possible',
      libraryItemId: 'artist-echo',
      reason: { kind: 'title-author' },
    });
  });

  it('no match: a genuinely new artist name, with or without an MBID on the library side, is new', () => {
    const library = [
      artistToOwnershipLibraryItem(
        fakeArtist({ id: 'artist-echo', name: 'Echo Fields', musicBrainzArtistId: 'mbid-echo' }),
      ),
    ];
    const candidate = fakeCandidate({
      title: 'Totally Different Artist',
      identifiers: { musicBrainzArtistId: 'mbid-somebody-else' },
    });

    const verdict = matchOwnership(externalCandidateToOwnershipItem(candidate), library);

    expect(verdict).toEqual({ status: 'new' });
  });

  it('an MBID present on both sides but disagreeing vetoes a same-name title match (different artist, same display name)', () => {
    const library = [
      artistToOwnershipLibraryItem(
        fakeArtist({
          id: 'artist-echo',
          name: 'Echo Fields',
          musicBrainzArtistId: 'mbid-echo-real',
        }),
      ),
    ];
    const candidate = fakeCandidate({
      title: 'Echo Fields',
      identifiers: { musicBrainzArtistId: 'mbid-echo-imposter' },
    });

    const verdict = matchOwnership(externalCandidateToOwnershipItem(candidate), library);

    expect(verdict).toEqual({ status: 'new' });
  });
});

describe('externalCandidateToAlbumPlaceholder', () => {
  it('produces an Album-shaped object honest about what it does not know, namespaced so it cannot collide with a real Jellyfin item id', () => {
    const candidate = fakeCandidate({
      providerName: 'listenbrainz',
      providerId: 'mbid-similar-1',
      title: 'Similar Artist',
      genres: ['Synthwave'],
    });

    expect(externalCandidateToAlbumPlaceholder(candidate)).toEqual({
      id: 'external:listenbrainz:mbid-similar-1',
      name: 'Similar Artist',
      sortName: null,
      artistId: null,
      artistName: null,
      productionYear: null,
      overview: null,
      genres: ['Synthwave'],
      imageTag: null,
      trackCount: null,
      favorite: false,
      playCount: 0,
      lastPlayedAt: null,
      musicBrainzAlbumId: null,
      musicBrainzReleaseGroupId: null,
    });
  });
});

describe('reasonForExternalShelf', () => {
  it('degrades to a generic line when no seed drove the shelf', () => {
    expect(reasonForExternalShelf([])).toBe('New artists to discover');
  });

  it('names the single seed', () => {
    expect(reasonForExternalShelf([{ label: 'Radiohead', identifiers: {} }])).toBe(
      'Because you listen to Radiohead',
    );
  });

  it('joins multiple seeds with a trailing "and", not an Oxford-comma list', () => {
    expect(
      reasonForExternalShelf([
        { label: 'Radiohead', identifiers: {} },
        { label: 'Boards of Canada', identifiers: {} },
        { label: 'Aphex Twin', identifiers: {} },
      ]),
    ).toBe('Because you listen to Radiohead, Boards of Canada and Aphex Twin');
  });
});
