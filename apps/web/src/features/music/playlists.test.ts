import { describe, expect, it } from 'vitest';
import { appendPlaylistItems, isOptimisticPlaylistItem, removePlaylistItems } from './playlists.js';
import type { JellyfinTrack } from '../../api/types.js';

const track = (id: string, name: string): JellyfinTrack => ({
  id,
  name,
  albumId: 'album-1',
  albumName: 'Driftwave',
  artistNames: ['The Nebula Collective'],
  trackNumber: 1,
  discNumber: 1,
  durationSeconds: 200,
  imageTag: null,
  genres: [],
  favorite: false,
});

describe('appendPlaylistItems', () => {
  it('appends new rows to the end, in the given order, each with a distinct optimistic id', () => {
    const page = {
      items: [{ playlistItemId: 'entry-a', track: track('track-1', 'First') }],
      total: 1,
      startIndex: 0,
    };

    const result = appendPlaylistItems(page, [
      track('track-2', 'Second'),
      track('track-3', 'Third'),
    ]) as {
      items: { playlistItemId: string; track: { id: string } }[];
      total: number;
    };

    expect(result.items.map((i) => i.track.id)).toEqual(['track-1', 'track-2', 'track-3']);
    expect(result.total).toBe(3);
    expect(isOptimisticPlaylistItem(result.items[1]!.playlistItemId)).toBe(true);
    expect(isOptimisticPlaylistItem(result.items[2]!.playlistItemId)).toBe(true);
    expect(result.items[1]!.playlistItemId).not.toBe(result.items[2]!.playlistItemId);
  });

  it('leaves the original page untouched — no mutation of the input', () => {
    const page = { items: [], total: 0, startIndex: 0 };
    appendPlaylistItems(page, [track('track-1', 'First')]);
    expect(page).toEqual({ items: [], total: 0, startIndex: 0 });
  });

  it('degrades to a no-op when data is not a recognised playlist-items page (nothing cached yet)', () => {
    expect(appendPlaylistItems(undefined, [track('track-1', 'First')])).toBeUndefined();
    const albumsPage = { items: [{ id: 'album-1', trackCount: 5 }], total: 1, startIndex: 0 };
    expect(appendPlaylistItems(albumsPage, [track('track-1', 'First')])).toBe(albumsPage);
  });

  it('is a no-op for an empty tracks array', () => {
    const page = { items: [], total: 0, startIndex: 0 };
    expect(appendPlaylistItems(page, [])).toBe(page);
  });
});

describe('removePlaylistItems', () => {
  it('removes exactly the matching entries by playlistItemId, leaving a duplicated track (same track id, different entry id) alone', () => {
    const page = {
      items: [
        { playlistItemId: 'entry-a', track: track('track-1', 'Repeat') },
        { playlistItemId: 'entry-b', track: track('track-1', 'Repeat') },
      ],
      total: 2,
      startIndex: 0,
    };

    const result = removePlaylistItems(page, ['entry-a']) as {
      items: { playlistItemId: string }[];
      total: number;
    };

    expect(result.items).toEqual([
      { playlistItemId: 'entry-b', track: track('track-1', 'Repeat') },
    ]);
    expect(result.total).toBe(1);
  });

  it('degrades to a no-op when data is not a recognised playlist-items page', () => {
    expect(removePlaylistItems(undefined, ['entry-a'])).toBeUndefined();
  });

  it('is a no-op when none of the given ids are present', () => {
    const page = {
      items: [{ playlistItemId: 'entry-a', track: track('track-1', 'X') }],
      total: 1,
      startIndex: 0,
    };
    expect(removePlaylistItems(page, ['entry-does-not-exist'])).toBe(page);
  });
});

describe('isOptimisticPlaylistItem', () => {
  it('is false for a real, server-issued entry id', () => {
    expect(isOptimisticPlaylistItem('a1b2c3d4e5f6')).toBe(false);
  });
});
