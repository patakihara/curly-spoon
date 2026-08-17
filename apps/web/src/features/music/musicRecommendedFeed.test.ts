/**
 * Pins `musicRecommendedFeed.ts`'s two behaviours: the shape mapping, and — the one that
 * matters most — that `null` (an unconfigured/errored Jellyfin, per `MusicHomePage.tsx`'s
 * own `isSuccess ? … : null` translation) degrades to an empty list rather than throwing
 * or producing a placeholder shelf. Never asserts exact `reason` text — that copy is the
 * server's first draft (docs/HANDOVER.md) and can change without breaking this.
 */
import { describe, expect, it } from 'vitest';
import { musicRecommendedShelvesToCarousels } from './musicRecommendedFeed.js';
import type { MusicRecommendedShelf } from '../../api/types.js';

function album(id: string, name: string) {
  return {
    id,
    name,
    sortName: null,
    artistId: 'artist-1',
    artistName: 'Nova Drift',
    productionYear: null,
    overview: null,
    genres: [],
    imageTag: null,
    trackCount: null,
    favorite: false,
  };
}

describe('musicRecommendedShelvesToCarousels', () => {
  it('degrades to an empty list when shelves is null — the "unknown or failed" case', () => {
    expect(musicRecommendedShelvesToCarousels(null, (id) => `art://${id}`)).toEqual([]);
  });

  it('maps a shelf to a FeedCarousel, carrying the reason and mapping each album', () => {
    const shelves: MusicRecommendedShelf[] = [
      {
        id: 'shelf-1',
        label: 'Because you liked Nova Drift',
        type: 'recommended',
        reason: 'Because you played Nova Drift a lot',
        items: [album('album-1', 'Driftwave'), album('album-2', 'Solstice')],
      },
    ];

    const carousels = musicRecommendedShelvesToCarousels(shelves, (id) => `art://${id}`);

    expect(carousels).toHaveLength(1);
    expect(carousels[0]).toMatchObject({
      id: 'shelf-1',
      label: 'Because you liked Nova Drift',
      contentType: 'music',
    });
    expect(carousels[0]!.reason).toBe('Because you played Nova Drift a lot');
    expect(carousels[0]!.items).toEqual([
      {
        id: 'album-1',
        contentType: 'music',
        title: 'Driftwave',
        subtitle: 'Nova Drift',
        coverSrc: 'art://album-1',
        fallbackIcon: 'music_note',
        progress: null,
      },
      {
        id: 'album-2',
        contentType: 'music',
        title: 'Solstice',
        subtitle: 'Nova Drift',
        coverSrc: 'art://album-2',
        fallbackIcon: 'music_note',
        progress: null,
      },
    ]);
  });

  it('drops a shelf with no items, same as the book-side mapper', () => {
    const shelves: MusicRecommendedShelf[] = [
      { id: 'empty', label: 'Empty', type: 'recommended', reason: 'r', items: [] },
    ];
    expect(musicRecommendedShelvesToCarousels(shelves, (id) => id)).toEqual([]);
  });

  // Wave 15d-1-W: `availability` is the server's wave-15d-1-S contract
  // (`docs/HANDOVER.md`) for telling an external (ListenBrainz-derived, not-owned) album
  // apart from a real one — read directly, never inferred from the `external:` id prefix.
  it("carries each album's availability through onto its FeedItem, unmodified", () => {
    const shelves: MusicRecommendedShelf[] = [
      {
        id: 'shelf-1',
        label: 'New artists to discover',
        type: 'discover',
        reason: 'Similar to Nova Drift',
        items: [
          { ...album('album-owned', 'Driftwave'), availability: 'owned' },
          {
            ...album('external:listenbrainz:mbid-1', 'Lumen Cascade'),
            artistName: null,
            availability: 'external',
          },
        ],
      },
    ];

    const carousels = musicRecommendedShelvesToCarousels(shelves, (id) => `art://${id}`);

    expect(carousels[0]!.items.map((item) => item.availability)).toEqual(['owned', 'external']);
  });
});
