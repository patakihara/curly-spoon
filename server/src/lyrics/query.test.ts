import { describe, expect, it } from 'vitest';
import { type IndexItem } from '../adapters/jellyfin/schemas.js';
import { albumRow, trackRows } from '../libraryIndex/rows.js';
import { lyricsQuery } from './query.js';

const albumItem: IndexItem = {
  Id: 'a1',
  Name: 'An Album',
  Type: 'MusicAlbum',
  AlbumArtists: [{ Id: 'b', Name: 'The Band' }],
};
const trackItem: IndexItem = {
  Id: 't1',
  Name: 'A Song',
  Type: 'Audio',
  RunTimeTicks: 3_696_000_000,
  ArtistItems: [
    { Id: 'b', Name: 'The Band feat. A Singer' },
    { Id: 's', Name: 'A Singer' },
  ],
};

const album = albumRow(albumItem, 'music');
const track = (item: Partial<IndexItem> = {}) =>
  trackRows('a1', 'music', [{ ...trackItem, ...item }])[0]!;

describe("LRCLIB's query for an indexed track", () => {
  it("asks for the track's first artist, its title, its album's title and its length to the second", () => {
    expect(lyricsQuery(track(), album)).toEqual({
      artistName: 'The Band feat. A Singer',
      trackName: 'A Song',
      albumName: 'An Album',
      duration: 370,
    });
  });

  it("names the album's artist when the track names none", () => {
    expect(lyricsQuery(track({ ArtistItems: [] }), album)?.artistName).toBe('The Band');
  });

  it('rounds the length to the nearest second', () => {
    expect(lyricsQuery(track({ RunTimeTicks: 1_004_960_000 }), album)?.duration).toBe(100);
    expect(lyricsQuery(track({ RunTimeTicks: 1_005_000_000 }), album)?.duration).toBe(101);
  });

  it('asks nothing for a track with no length, or with no artist on it or its album', () => {
    expect(lyricsQuery(track({ RunTimeTicks: null }), album)).toBeNull();
    const nobody = albumRow({ ...albumItem, AlbumArtists: [] }, 'music');
    expect(lyricsQuery(track({ ArtistItems: [] }), nobody)).toBeNull();
    expect(lyricsQuery(track({ ArtistItems: [{ Id: 'x', Name: '' }] }), nobody)).toBeNull();
  });
});
