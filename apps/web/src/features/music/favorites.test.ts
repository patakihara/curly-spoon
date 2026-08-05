import { describe, expect, it } from 'vitest';
import { withFavoriteState } from './favorites.js';

describe('withFavoriteState', () => {
  it('flips the matching item inside a JellyfinLibraryPage-shaped cache entry', () => {
    const page = {
      items: [
        { id: 'album-1', name: 'Driftwave', favorite: false },
        { id: 'album-2', name: 'Nightglass', favorite: false },
      ],
      total: 2,
      startIndex: 0,
    };

    const result = withFavoriteState(page, 'album-1', true);

    expect(result).toEqual({
      items: [
        { id: 'album-1', name: 'Driftwave', favorite: true },
        { id: 'album-2', name: 'Nightglass', favorite: false },
      ],
      total: 2,
      startIndex: 0,
    });
  });

  it('leaves every other item, and the page itself, untouched — no id in the page matches', () => {
    const page = { items: [{ id: 'album-2', favorite: false }], total: 1, startIndex: 0 };

    const result = withFavoriteState(page, 'album-1', true);

    expect(result).toEqual(page);
  });

  it('does not mutate the input page', () => {
    const page = { items: [{ id: 'album-1', favorite: false }], total: 1, startIndex: 0 };

    withFavoriteState(page, 'album-1', true);

    expect(page.items[0]!.favorite).toBe(false);
  });

  it('flips the matching item across all three arrays of a JellyfinSearchResults-shaped entry', () => {
    const results = {
      artists: [{ id: 'artist-1', favorite: false }],
      albums: [{ id: 'album-1', favorite: false }],
      tracks: [
        { id: 'track-1', favorite: false },
        { id: 'album-1', favorite: false },
      ],
    };

    const result = withFavoriteState(results, 'album-1', true);

    expect(result).toEqual({
      artists: [{ id: 'artist-1', favorite: false }],
      albums: [{ id: 'album-1', favorite: true }],
      tracks: [
        { id: 'track-1', favorite: false },
        { id: 'album-1', favorite: true },
      ],
    });
  });

  it('passes non-favouritable data through unchanged (JellyfinConfig-shaped, for example)', () => {
    const config = {
      configured: true,
      baseUrl: 'http://fake.jellyfin.local',
      hasCredentials: true,
    };

    expect(withFavoriteState(config, 'album-1', true)).toEqual(config);
  });

  it('passes through undefined, null and primitive cache values unchanged', () => {
    expect(withFavoriteState(undefined, 'album-1', true)).toBeUndefined();
    expect(withFavoriteState(null, 'album-1', true)).toBeNull();
    expect(withFavoriteState('not-an-object', 'album-1', true)).toBe('not-an-object');
  });

  it('sets favorite: false when unmarking', () => {
    const page = { items: [{ id: 'album-1', favorite: true }], total: 1, startIndex: 0 };

    const result = withFavoriteState(page, 'album-1', false);

    expect(result).toEqual({
      items: [{ id: 'album-1', favorite: false }],
      total: 1,
      startIndex: 0,
    });
  });
});
