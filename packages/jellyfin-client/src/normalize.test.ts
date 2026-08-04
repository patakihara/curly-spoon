import { describe, expect, it } from 'vitest';
import {
  normalizeAlbum,
  normalizeArtist,
  normalizeLogin,
  normalizeTrack,
  normalizeUser,
} from './normalize.js';
import type { rawAuthenticationResultSchema, rawBaseItemDtoSchema } from './schemas/raw.js';
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
      }),
    );
    expect(artist).toEqual({
      id: 'artist-1',
      name: 'Boards of Canada',
      overview: 'Scottish electronic duo',
      imageTag: 'tag-abc',
      albumCount: 5,
    });
  });

  it('defaults a missing name to a placeholder rather than surfacing undefined to the UI', () => {
    const artist = normalizeArtist(rawItem({ Id: 'artist-2', Name: null }));
    expect(artist.name).toBe('(unknown artist)');
  });

  it('defaults every other optional field to null when the server omits them', () => {
    const artist = normalizeArtist(rawItem({ Id: 'artist-3' }));
    expect(artist).toEqual({
      id: 'artist-3',
      name: '(unknown artist)',
      overview: null,
      imageTag: null,
      albumCount: null,
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
      }),
    );
    expect(album.artistId).toBe('artist-1');
    expect(album.artistName).toBe('Boards of Canada');
    expect(album.genres).toEqual(['IDM', 'Ambient']);
    expect(album.trackCount).toBe(17);
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
    });
  });

  it('defaults duration and every optional field to null/[] when the server omits them', () => {
    const track = normalizeTrack(rawItem({ Id: 'track-2', Name: 'Untitled' }));
    expect(track.durationSeconds).toBeNull();
    expect(track.albumId).toBeNull();
    expect(track.trackNumber).toBeNull();
    expect(track.discNumber).toBeNull();
    expect(track.artistNames).toEqual([]);
    expect(track.genres).toEqual([]);
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
