import { describe, expect, it } from 'vitest';
import type { Album, Track } from '@auralis/jellyfin-client';
import { albumToCandidate, buildMusicProgressSignals } from './adaptMusic.js';

function album(overrides: Partial<Album>): Album {
  return {
    id: 'album-1',
    name: 'Some Album',
    sortName: null,
    artistId: null,
    artistName: null,
    productionYear: null,
    overview: null,
    genres: [],
    imageTag: null,
    trackCount: null,
    favorite: false,
    playCount: 0,
    lastPlayedAt: null,
    musicBrainzAlbumId: null,
    musicBrainzReleaseGroupId: null,
    ...overrides,
  };
}

function track(overrides: Partial<Track>): Track {
  return {
    id: 'track-1',
    name: 'Some Track',
    albumId: null,
    albumName: null,
    artistNames: [],
    trackNumber: null,
    discNumber: null,
    durationSeconds: null,
    imageTag: null,
    genres: [],
    favorite: false,
    playCount: 0,
    lastPlayedAt: null,
    musicBrainzTrackId: null,
    ...overrides,
  };
}

describe('albumToCandidate', () => {
  it('maps genres straight through and folds the artist into a one-element authors array', () => {
    const candidate = albumToCandidate(
      album({
        id: 'album-driftwave',
        name: 'Driftwave',
        genres: ['Synthwave'],
        artistName: 'The Nebula Collective',
      }),
    );

    expect(candidate).toEqual({
      id: 'album-driftwave',
      media: {
        kind: 'album',
        title: 'Driftwave',
        genres: ['Synthwave'],
        authors: [{ name: 'The Nebula Collective' }],
        series: [],
        narrator: null,
      },
    });
  });

  it('folds a null artist name into an empty authors array, not a blank-named entry', () => {
    const candidate = albumToCandidate(album({ artistName: null }));
    expect(candidate.media.authors).toEqual([]);
  });

  it('folds a blank artist name into an empty authors array', () => {
    const candidate = albumToCandidate(album({ artistName: '   ' }));
    expect(candidate.media.authors).toEqual([]);
  });
});

describe('buildMusicProgressSignals', () => {
  it('aggregates per-track playCount into one signal per album, keyed on the album id', () => {
    const tracks = [
      track({ id: 't1', albumId: 'album-a', playCount: 2, lastPlayedAt: 1000 }),
      track({ id: 't2', albumId: 'album-a', playCount: 3, lastPlayedAt: 2000 }),
    ];

    const signals = buildMusicProgressSignals(tracks);

    expect(signals).toEqual([
      { itemId: 'album-a', progress: 1, isFinished: true, lastActivityAt: 2000 },
    ]);
  });

  it("takes the latest lastPlayedAt across an album's tracks, not the first or the sum", () => {
    const tracks = [
      track({ id: 't1', albumId: 'album-a', playCount: 1, lastPlayedAt: 5000 }),
      track({ id: 't2', albumId: 'album-a', playCount: 1, lastPlayedAt: 1000 }),
    ];

    const signals = buildMusicProgressSignals(tracks);
    expect(signals[0]?.lastActivityAt).toBe(5000);
  });

  it('emits no signal at all for an album with zero total plays', () => {
    const tracks = [track({ albumId: 'album-a', playCount: 0, lastPlayedAt: null })];
    expect(buildMusicProgressSignals(tracks)).toEqual([]);
  });

  it('emits null lastActivityAt when no track in the album has ever played', () => {
    const tracks = [
      track({ id: 't1', albumId: 'album-a', playCount: 1, lastPlayedAt: null }),
      track({ id: 't2', albumId: 'album-a', playCount: 0, lastPlayedAt: null }),
    ];
    const signals = buildMusicProgressSignals(tracks);
    expect(signals[0]?.lastActivityAt).toBeNull();
  });

  it('skips a track with no albumId — nothing to attribute the play to', () => {
    const tracks = [track({ id: 't1', albumId: null, playCount: 5, lastPlayedAt: 1000 })];
    expect(buildMusicProgressSignals(tracks)).toEqual([]);
  });

  it('keeps two different albums as two independent signals', () => {
    const tracks = [
      track({ id: 't1', albumId: 'album-a', playCount: 1, lastPlayedAt: 1000 }),
      track({ id: 't2', albumId: 'album-b', playCount: 1, lastPlayedAt: 2000 }),
    ];
    const signals = buildMusicProgressSignals(tracks);
    const ids = signals.map((s) => s.itemId).sort();
    expect(ids).toEqual(['album-a', 'album-b']);
  });
});
