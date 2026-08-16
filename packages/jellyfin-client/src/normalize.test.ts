import { describe, expect, it } from 'vitest';
import {
  normalizeAlbum,
  normalizeArtist,
  normalizeFavoriteState,
  normalizeLastPlayedAt,
  normalizeLogin,
  normalizeLyrics,
  normalizePlayCount,
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
        UserData: { IsFavorite: true, PlayCount: 42, LastPlayedDate: '2026-08-01T12:00:00Z' },
        ProviderIds: { MusicBrainzArtist: 'mbid-artist-1' },
      }),
    );
    expect(artist).toEqual({
      id: 'artist-1',
      name: 'Boards of Canada',
      overview: 'Scottish electronic duo',
      imageTag: 'tag-abc',
      albumCount: 5,
      favorite: true,
      playCount: 42,
      lastPlayedAt: Date.parse('2026-08-01T12:00:00Z'),
      musicBrainzArtistId: 'mbid-artist-1',
    });
  });

  it('defaults a missing name to a placeholder rather than surfacing undefined to the UI', () => {
    const artist = normalizeArtist(rawItem({ Id: 'artist-2', Name: null }));
    expect(artist.name).toBe('(unknown artist)');
  });

  it('defaults every other optional field to null (favorite to false, playCount to 0, lastPlayedAt to null) when the server omits them', () => {
    const artist = normalizeArtist(rawItem({ Id: 'artist-3' }));
    expect(artist).toEqual({
      id: 'artist-3',
      name: '(unknown artist)',
      overview: null,
      imageTag: null,
      albumCount: null,
      favorite: false,
      playCount: 0,
      lastPlayedAt: null,
      musicBrainzArtistId: null,
    });
  });

  it('normalizes an unparseable LastPlayedDate to null, never NaN', () => {
    const artist = normalizeArtist(
      rawItem({ Id: 'artist-4', UserData: { LastPlayedDate: 'not-a-date' } }),
    );
    expect(artist.lastPlayedAt).toBeNull();
  });

  // wave 15a-0: ListenBrainz keys artist lookups on MusicBrainz's own artist id.
  it('normalizes a missing MusicBrainzArtist provider id to null, never throwing', () => {
    const artist = normalizeArtist(rawItem({ Id: 'artist-5', ProviderIds: {} }));
    expect(artist.musicBrainzArtistId).toBeNull();
  });

  it('normalizes an entirely absent ProviderIds to musicBrainzArtistId: null, never throwing', () => {
    const artist = normalizeArtist(rawItem({ Id: 'artist-6', ProviderIds: undefined }));
    expect(artist.musicBrainzArtistId).toBeNull();
  });

  it('ignores unrecognised ProviderIds keys without losing the known one', () => {
    const artist = normalizeArtist(
      rawItem({
        Id: 'artist-7',
        ProviderIds: { MusicBrainzArtist: 'mbid-artist-7', SomeFutureProvider: 'xyz' },
      }),
    );
    expect(artist.musicBrainzArtistId).toBe('mbid-artist-7');
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
        UserData: { IsFavorite: true, PlayCount: 3, LastPlayedDate: '2026-07-15T08:30:00Z' },
        ProviderIds: {
          MusicBrainzAlbum: 'mbid-album-1',
          MusicBrainzReleaseGroup: 'mbid-releasegroup-1',
        },
      }),
    );
    expect(album.artistId).toBe('artist-1');
    expect(album.artistName).toBe('Boards of Canada');
    expect(album.genres).toEqual(['IDM', 'Ambient']);
    expect(album.trackCount).toBe(17);
    expect(album.favorite).toBe(true);
    expect(album.playCount).toBe(3);
    expect(album.lastPlayedAt).toBe(Date.parse('2026-07-15T08:30:00Z'));
    expect(album.musicBrainzAlbumId).toBe('mbid-album-1');
    expect(album.musicBrainzReleaseGroupId).toBe('mbid-releasegroup-1');
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
    expect(album.playCount).toBe(0);
    expect(album.lastPlayedAt).toBeNull();
    expect(album.musicBrainzAlbumId).toBeNull();
    expect(album.musicBrainzReleaseGroupId).toBeNull();
  });

  // wave 15a-0: Audnexus-style catalogues and ListenBrainz key album lookups on these.
  it('normalizes an explicit-null ProviderIds field to null, never throwing', () => {
    const album = normalizeAlbum(rawItem({ Id: 'album-4', ProviderIds: null }));
    expect(album.musicBrainzAlbumId).toBeNull();
    expect(album.musicBrainzReleaseGroupId).toBeNull();
  });

  it('ignores unrecognised ProviderIds keys without losing the known ones', () => {
    const album = normalizeAlbum(
      rawItem({
        Id: 'album-5',
        ProviderIds: { MusicBrainzAlbum: 'mbid-album-5', Tmdb: 'irrelevant' },
      }),
    );
    expect(album.musicBrainzAlbumId).toBe('mbid-album-5');
    expect(album.musicBrainzReleaseGroupId).toBeNull();
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
        UserData: { IsFavorite: true, PlayCount: 11, LastPlayedDate: '2026-08-10T20:00:00Z' },
        ProviderIds: { MusicBrainzTrack: 'mbid-track-1' },
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
      playCount: 11,
      lastPlayedAt: Date.parse('2026-08-10T20:00:00Z'),
      musicBrainzTrackId: 'mbid-track-1',
    });
  });

  it('defaults duration and every optional field to null/[]/false/0 when the server omits them', () => {
    const track = normalizeTrack(rawItem({ Id: 'track-2', Name: 'Untitled' }));
    expect(track.durationSeconds).toBeNull();
    expect(track.albumId).toBeNull();
    expect(track.trackNumber).toBeNull();
    expect(track.discNumber).toBeNull();
    expect(track.artistNames).toEqual([]);
    expect(track.genres).toEqual([]);
    expect(track.favorite).toBe(false);
    expect(track.playCount).toBe(0);
    expect(track.lastPlayedAt).toBeNull();
  });

  it('normalizes an entirely absent UserData fragment to playCount: 0 and lastPlayedAt: null', () => {
    const track = normalizeTrack(rawItem({ Id: 'track-3', UserData: undefined }));
    expect(track.playCount).toBe(0);
    expect(track.lastPlayedAt).toBeNull();
  });

  it('normalizes UserData present with all new fields explicitly null', () => {
    const track = normalizeTrack(
      rawItem({
        Id: 'track-4',
        UserData: { IsFavorite: null, PlayCount: null, LastPlayedDate: null },
      }),
    );
    expect(track.favorite).toBe(false);
    expect(track.playCount).toBe(0);
    expect(track.lastPlayedAt).toBeNull();
  });

  // wave 15a-0: ListenBrainz keys track (recording) lookups on MusicBrainzTrack.
  it('normalizes a missing MusicBrainzTrack provider id to null, never throwing', () => {
    const track = normalizeTrack(
      rawItem({ Id: 'track-5', ProviderIds: { MusicBrainzAlbum: 'x' } }),
    );
    expect(track.musicBrainzTrackId).toBeNull();
  });

  it('normalizes an explicit-null ProviderIds field to null, never throwing', () => {
    const track = normalizeTrack(rawItem({ Id: 'track-6', ProviderIds: null }));
    expect(track.musicBrainzTrackId).toBeNull();
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

describe('normalizePlayCount', () => {
  it('reads a positive PlayCount through', () => {
    expect(normalizePlayCount({ PlayCount: 7 })).toBe(7);
  });

  it('reads PlayCount: 0 through as a definite 0, not just falsy', () => {
    expect(normalizePlayCount({ PlayCount: 0 })).toBe(0);
  });

  it('defaults to 0 when PlayCount is absent', () => {
    expect(normalizePlayCount({})).toBe(0);
  });

  it('defaults to 0 when PlayCount is null', () => {
    expect(normalizePlayCount({ PlayCount: null })).toBe(0);
  });

  it('defaults to 0 when the whole UserData fragment is null or absent', () => {
    expect(normalizePlayCount(null)).toBe(0);
    expect(normalizePlayCount(undefined)).toBe(0);
  });
});

describe('normalizeLastPlayedAt', () => {
  it('converts a real ISO-8601 date to the correct epoch milliseconds', () => {
    expect(normalizeLastPlayedAt({ LastPlayedDate: '2026-08-01T12:00:00Z' })).toBe(
      Date.parse('2026-08-01T12:00:00Z'),
    );
  });

  it('returns null when LastPlayedDate is absent', () => {
    expect(normalizeLastPlayedAt({})).toBeNull();
  });

  it('returns null when LastPlayedDate is null', () => {
    expect(normalizeLastPlayedAt({ LastPlayedDate: null })).toBeNull();
  });

  it('returns null, never NaN, when LastPlayedDate is an unparseable string', () => {
    const result = normalizeLastPlayedAt({ LastPlayedDate: 'definitely-not-a-date' });
    expect(result).toBeNull();
    expect(Number.isNaN(result)).toBe(false);
  });

  it('returns null when the whole UserData fragment is null or absent', () => {
    expect(normalizeLastPlayedAt(null)).toBeNull();
    expect(normalizeLastPlayedAt(undefined)).toBeNull();
  });
});
