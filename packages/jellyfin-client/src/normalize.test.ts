import { describe, expect, it } from 'vitest';
import {
  normalizeAlbum,
  normalizeArtist,
  normalizeFavoriteState,
  normalizeLogin,
  normalizeLyrics,
  normalizePlaylist,
  normalizePlaylistItem,
  normalizeTrack,
  normalizeUser,
} from './normalize.js';
import type {
  rawAuthenticationResultSchema,
  rawBaseItemDtoSchema,
  rawLyricDtoSchema,
} from './schemas/raw.js';
import type { z } from 'zod';

type RawItem = z.infer<typeof rawBaseItemDtoSchema>;

function rawItem(overrides: Partial<RawItem> = {}): RawItem {
  return { Id: 'item-1', ...overrides };
}

describe('normalizeArtist', () => {
  it('maps a fully-populated artist item', () => {
    const artist = normalizeArtist(
      rawItem({
        Id: 'artist-1',
        Name: 'Boards of Canada',
        Overview: 'Scottish electronic duo',
        ImageTags: { Primary: 'tag-abc' },
        ChildCount: 5,
        UserData: { IsFavorite: true },
      }),
    );
    expect(artist).toEqual({
      id: 'artist-1',
      name: 'Boards of Canada',
      overview: 'Scottish electronic duo',
      imageTag: 'tag-abc',
      albumCount: 5,
      favorite: true,
    });
  });

  it('defaults a missing name to a placeholder rather than surfacing undefined to the UI', () => {
    const artist = normalizeArtist(rawItem({ Id: 'artist-2', Name: null }));
    expect(artist.name).toBe('(unknown artist)');
  });

  it('defaults every other optional field to null (and favorite to false) when the server omits them', () => {
    const artist = normalizeArtist(rawItem({ Id: 'artist-3' }));
    expect(artist).toEqual({
      id: 'artist-3',
      name: '(unknown artist)',
      overview: null,
      imageTag: null,
      albumCount: null,
      favorite: false,
    });
  });
});

describe('normalizeAlbum', () => {
  it('maps a fully-populated album item, preferring AlbumArtists for the artist link', () => {
    const album = normalizeAlbum(
      rawItem({
        Id: 'album-1',
        Name: 'Music Has the Right to Children',
        SortName: 'music has the right to children',
        ProductionYear: 1998,
        Overview: 'Debut album',
        Genres: ['IDM', 'Ambient'],
        ImageTags: { Primary: 'tag-def' },
        ChildCount: 17,
        AlbumArtists: [{ Id: 'artist-1', Name: 'Boards of Canada' }],
        ArtistItems: [{ Id: 'other-artist', Name: 'Someone Else' }],
        UserData: { IsFavorite: true },
      }),
    );
    expect(album.artistId).toBe('artist-1');
    expect(album.artistName).toBe('Boards of Canada');
    expect(album.genres).toEqual(['IDM', 'Ambient']);
    expect(album.trackCount).toBe(17);
    expect(album.favorite).toBe(true);
  });

  it('falls back to ArtistItems when AlbumArtists is absent', () => {
    const album = normalizeAlbum(
      rawItem({
        Id: 'album-2',
        ArtistItems: [{ Id: 'artist-2', Name: 'Fallback Artist' }],
      }),
    );
    expect(album.artistId).toBe('artist-2');
    expect(album.artistName).toBe('Fallback Artist');
  });

  it('defaults an absent artist link and genre list rather than throwing', () => {
    const album = normalizeAlbum(rawItem({ Id: 'album-3', Name: 'No Artist Data' }));
    expect(album.artistId).toBeNull();
    expect(album.artistName).toBeNull();
    expect(album.genres).toEqual([]);
    expect(album.favorite).toBe(false);
  });
});

describe('normalizeTrack', () => {
  it('maps a fully-populated track item, converting RunTimeTicks to seconds', () => {
    const track = normalizeTrack(
      rawItem({
        Id: 'track-1',
        Name: 'Roygbiv',
        Album: 'Music Has the Right to Children',
        AlbumId: 'album-1',
        Artists: ['Boards of Canada'],
        IndexNumber: 7,
        ParentIndexNumber: 1,
        RunTimeTicks: 25_000_000, // 2.5 seconds
        ImageTags: { Primary: 'tag-ghi' },
        Genres: ['IDM'],
        UserData: { IsFavorite: true },
      }),
    );
    expect(track).toEqual({
      id: 'track-1',
      name: 'Roygbiv',
      albumId: 'album-1',
      albumName: 'Music Has the Right to Children',
      artistNames: ['Boards of Canada'],
      trackNumber: 7,
      discNumber: 1,
      durationSeconds: 2.5,
      imageTag: 'tag-ghi',
      genres: ['IDM'],
      favorite: true,
    });
  });

  it('defaults duration and every optional field to null/[]/false when the server omits them', () => {
    const track = normalizeTrack(rawItem({ Id: 'track-2', Name: 'Untitled' }));
    expect(track.durationSeconds).toBeNull();
    expect(track.albumId).toBeNull();
    expect(track.trackNumber).toBeNull();
    expect(track.discNumber).toBeNull();
    expect(track.artistNames).toEqual([]);
    expect(track.genres).toEqual([]);
    expect(track.favorite).toBe(false);
  });
});

describe('normalizePlaylist', () => {
  it('maps a fully-populated playlist item', () => {
    const playlist = normalizePlaylist(
      rawItem({ Id: 'pl-1', Name: 'Roadtrip', ChildCount: 8, ImageTags: { Primary: 'tag-pl' } }),
    );
    expect(playlist).toEqual({
      id: 'pl-1',
      name: 'Roadtrip',
      imageTag: 'tag-pl',
      trackCount: 8,
    });
  });

  it('defaults a missing name and missing counts rather than surfacing undefined', () => {
    const playlist = normalizePlaylist(rawItem({ Id: 'pl-2', Name: null }));
    expect(playlist).toEqual({
      id: 'pl-2',
      name: '(unknown playlist)',
      imageTag: null,
      trackCount: null,
    });
  });
});

describe('normalizePlaylistItem', () => {
  it('keeps the entry id separate from the track id', () => {
    const item = normalizePlaylistItem(
      rawItem({ Id: 'track-1', Name: 'Roygbiv', PlaylistItemId: 'entry-a' }),
    );
    expect(item.playlistItemId).toBe('entry-a');
    expect(item.track.id).toBe('track-1');
    expect(item.track.name).toBe('Roygbiv');
  });

  it('falls back to the track id when PlaylistItemId is absent, so a caller always has something to key removal on', () => {
    const item = normalizePlaylistItem(rawItem({ Id: 'track-2' }));
    expect(item.playlistItemId).toBe('track-2');
  });
});

describe('normalizeUser / normalizeLogin', () => {
  it('maps a user DTO, defaulting a missing name to a placeholder', () => {
    const user = normalizeUser({ Id: 'user-1', Name: null, ServerId: 'server-1' });
    expect(user).toEqual({ id: 'user-1', name: '(unknown user)', serverId: 'server-1' });
  });

  it('maps a full authentication result into a LoginResult', () => {
    const raw: z.infer<typeof rawAuthenticationResultSchema> = {
      User: { Id: 'user-1', Name: 'kara', ServerId: 'server-1' },
      AccessToken: 'access-token-1',
      ServerId: 'server-1',
    };
    const result = normalizeLogin(raw);
    expect(result).toEqual({
      token: 'access-token-1',
      serverId: 'server-1',
      user: { id: 'user-1', name: 'kara', serverId: 'server-1' },
    });
  });
});

describe('normalizeLyrics', () => {
  type RawLyricDto = z.infer<typeof rawLyricDtoSchema>;

  it('converts every line’s Start from ticks to seconds and reports synced: true when every line has one', () => {
    const raw: RawLyricDto = {
      Metadata: {},
      Lyrics: [
        { Text: 'First line', Start: 0 },
        { Text: 'Second line', Start: 25_000_000 }, // 2.5s
        { Text: 'Third line', Start: 100_000_000 }, // 10s
      ],
    };
    expect(normalizeLyrics(raw)).toEqual({
      lines: [
        { text: 'First line', startSeconds: 0 },
        { text: 'Second line', startSeconds: 2.5 },
        { text: 'Third line', startSeconds: 10 },
      ],
      synced: true,
    });
  });

  it('reports synced: false and startSeconds: null for every line when none carry a Start (an unsynced .txt lyric)', () => {
    const raw: RawLyricDto = {
      Metadata: {},
      Lyrics: [{ Text: 'Some lyrics' }, { Text: 'with no timing at all' }],
    };
    const result = normalizeLyrics(raw);
    expect(result.synced).toBe(false);
    expect(result.lines).toEqual([
      { text: 'Some lyrics', startSeconds: null },
      { text: 'with no timing at all', startSeconds: null },
    ]);
  });

  it('trusts the given line order rather than re-sorting by Start', () => {
    // Deliberately out of order — normalizeLyrics must not reorder it. The real upstream
    // (LrcLyricParser) always pre-sorts, so an out-of-order response like this would only
    // happen from a malformed/hand-edited upstream; the client's job is to render exactly
    // what it was given, not to second-guess it.
    const raw: RawLyricDto = {
      Metadata: {},
      Lyrics: [
        { Text: 'Later line', Start: 50_000_000 },
        { Text: 'Earlier line', Start: 10_000_000 },
      ],
    };
    const result = normalizeLyrics(raw);
    expect(result.lines.map((l) => l.text)).toEqual(['Later line', 'Earlier line']);
  });

  it('treats an empty Lyrics array as unsynced rather than throwing', () => {
    const raw: RawLyricDto = { Metadata: {}, Lyrics: [] };
    expect(normalizeLyrics(raw)).toEqual({ lines: [], synced: false });
  });
});

describe('normalizeFavoriteState', () => {
  it('reads IsFavorite: true through', () => {
    expect(normalizeFavoriteState({ IsFavorite: true })).toBe(true);
  });

  it('reads IsFavorite: false through as a definite false, not just falsy', () => {
    expect(normalizeFavoriteState({ IsFavorite: false })).toBe(false);
  });

  it('defaults to false when IsFavorite is absent', () => {
    expect(normalizeFavoriteState({})).toBe(false);
  });

  it('defaults to false when IsFavorite is null', () => {
    expect(normalizeFavoriteState({ IsFavorite: null })).toBe(false);
  });

  it('defaults to false when the whole UserData fragment is null or absent', () => {
    expect(normalizeFavoriteState(null)).toBe(false);
    expect(normalizeFavoriteState(undefined)).toBe(false);
  });
});
