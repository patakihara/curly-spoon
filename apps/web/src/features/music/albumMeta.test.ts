import { describe, expect, it } from 'vitest';
import { composeAlbumMeta } from './albumMeta.js';

describe('composeAlbumMeta', () => {
  it('composes the literal example from ALBUM_DETAIL.md §5 against the real fixture', () => {
    // Driftwave: 2021, Synthwave, 2 tracks, 214s + 198s = 412s -> round(412/60) = 7 minutes.
    expect(
      composeAlbumMeta({
        productionYear: 2021,
        genre: 'Synthwave',
        trackCount: 2,
        durationSeconds: 412,
      }),
    ).toBe('2021 · Synthwave · 2 tracks · 7 m');
  });

  it('omits missing segments with no separator artifacts', () => {
    expect(composeAlbumMeta({ trackCount: 5 })).toBe('5 tracks');
    expect(composeAlbumMeta({ productionYear: 2019, trackCount: 3 })).toBe('2019 · 3 tracks');
    expect(composeAlbumMeta({ genre: 'Ambient', trackCount: 4 })).toBe('Ambient · 4 tracks');
  });

  it('uses singular "track" for exactly one track, plural otherwise', () => {
    expect(composeAlbumMeta({ trackCount: 1 })).toBe('1 track');
    expect(composeAlbumMeta({ trackCount: 0 })).toBe('0 tracks');
    expect(composeAlbumMeta({ trackCount: 2 })).toBe('2 tracks');
  });

  it('renders nothing while the track count is unknown (the first page has not loaded)', () => {
    expect(
      composeAlbumMeta({ productionYear: 2021, genre: 'Synthwave', trackCount: null }),
    ).toBeNull();
  });

  it('omits duration when not computed — a multi-page album, or one not fully loaded', () => {
    expect(composeAlbumMeta({ trackCount: 50 })).toBe('50 tracks');
    expect(composeAlbumMeta({ trackCount: 50, durationSeconds: null })).toBe('50 tracks');
  });
});
