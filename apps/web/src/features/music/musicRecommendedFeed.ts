/**
 * Pure mapping from `GET /music/recommended`'s shelves (docs/ROADMAP.md §13, wave
 * 13f-1) to the `FeedCarousel` shape `home/Carousel.tsx` already renders — reusing that
 * one carousel component rather than inventing a second, per this wave's spec. Kept out
 * of `MusicHomePage.tsx` for the same reason `forYouFeed.ts` is kept out of
 * `HomePage.tsx`: this is behaviour worth testing directly, not through rendered JSX.
 *
 * `shelves: MusicRecommendedShelf[] | null` — `null` means "unknown or failed" (the
 * query is loading, hasn't run, or rejected with a 409/401 because Jellyfin isn't
 * configured for this user), and produces exactly the same `[]` as a signal-less user's
 * genuine empty response. This is deliberately the *only* place that distinction is
 * collapsed: `MusicHomePage.tsx` passes `recommendedQuery.isSuccess ? recommendedQuery
 * .data.shelves : null`, never rendering an error state, a toast, or a retry spinner for
 * this section — see `docs/HANDOVER.md`'s standing rule that `/music` must never surface
 * an error where a quiet no-op belongs, and `client.test.ts`/`musicRecommendedFeed.test.ts`
 * for what pins it. Mirrors `forYouFeed.ts`'s `buildForYouCarousels`'s identical
 * `recommendedShelves: RecommendedShelf[] | null` contract on the book side.
 */
import type { MusicRecommendedShelf } from '../../api/types.js';
import { albumsToCarousel, type FeedCarousel } from '../home/forYouFeed.js';

/** A shelf with no items is dropped, same as `recommendedShelvesToCarousels` already does
 * for the book side — defensive rather than trusting the server's "at least 2 items per
 * shelf" guarantee forever. */
export function musicRecommendedShelvesToCarousels(
  shelves: MusicRecommendedShelf[] | null,
  artworkUrl: (albumId: string) => string,
): FeedCarousel[] {
  if (!shelves) return [];
  return shelves
    .filter((shelf) => shelf.items.length > 0)
    .map((shelf) => ({
      ...albumsToCarousel(shelf.id, shelf.label, shelf.items, artworkUrl),
      reason: shelf.reason,
    }));
}
