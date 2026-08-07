import { describe, expect, it, vi } from 'vitest';
import { buildTrackMenuItems } from './trackContextMenu.js';

function handlers() {
  return {
    playNext: vi.fn(),
    playLast: vi.fn(),
    goToAlbum: vi.fn(),
    goToArtist: vi.fn(),
  };
}

describe('buildTrackMenuItems', () => {
  it('always includes Play next and Play last, in that order, first', () => {
    const items = buildTrackMenuItems({ albumId: null, artistId: null }, handlers());
    expect(items[0]).toMatchObject({ key: 'play-next', label: 'Play next' });
    expect(items[1]).toMatchObject({ key: 'play-last', label: 'Play last' });
  });

  it('omits Go to album and Go to artist when a track has neither', () => {
    const items = buildTrackMenuItems({ albumId: null, artistId: null }, handlers());
    expect(items).toHaveLength(2);
    expect(items.some((i) => i.key === 'go-to-album')).toBe(false);
    expect(items.some((i) => i.key === 'go-to-artist')).toBe(false);
  });

  it('includes Go to album only when albumId is known', () => {
    const items = buildTrackMenuItems({ albumId: 'album-1', artistId: null }, handlers());
    expect(items.map((i) => i.key)).toEqual(['play-next', 'play-last', 'go-to-album']);
  });

  it('includes Go to artist only when artistId is known', () => {
    const items = buildTrackMenuItems({ albumId: null, artistId: 'artist-1' }, handlers());
    expect(items.map((i) => i.key)).toEqual(['play-next', 'play-last', 'go-to-artist']);
  });

  it('includes all four items when both album and artist are known', () => {
    const items = buildTrackMenuItems({ albumId: 'album-1', artistId: 'artist-1' }, handlers());
    expect(items.map((i) => i.key)).toEqual([
      'play-next',
      'play-last',
      'go-to-album',
      'go-to-artist',
    ]);
  });

  it("go-to-album's onSelect calls goToAlbum with this track's albumId", () => {
    const h = handlers();
    const items = buildTrackMenuItems({ albumId: 'album-42', artistId: null }, h);
    items.find((i) => i.key === 'go-to-album')?.onSelect();
    expect(h.goToAlbum).toHaveBeenCalledWith('album-42');
    expect(h.goToArtist).not.toHaveBeenCalled();
  });

  it("go-to-artist's onSelect calls goToArtist with this track's artistId", () => {
    const h = handlers();
    const items = buildTrackMenuItems({ albumId: null, artistId: 'artist-42' }, h);
    items.find((i) => i.key === 'go-to-artist')?.onSelect();
    expect(h.goToArtist).toHaveBeenCalledWith('artist-42');
    expect(h.goToAlbum).not.toHaveBeenCalled();
  });

  it('play-next and play-last call their own handler with no arguments', () => {
    const h = handlers();
    const items = buildTrackMenuItems({ albumId: null, artistId: null }, h);
    items.find((i) => i.key === 'play-next')?.onSelect();
    items.find((i) => i.key === 'play-last')?.onSelect();
    expect(h.playNext).toHaveBeenCalledTimes(1);
    expect(h.playLast).toHaveBeenCalledTimes(1);
  });
});
