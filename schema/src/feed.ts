/**
 * Browse's shelves (`GET /api/feed`): Up next, then your second most recent book and show, each
 * a card for a book or episode to play next. Only what you own is served, and music never is.
 */
import { Availability, Fraction } from './library.js';
import { ArtUrl, MediaRef } from './play.js';
import { z } from './zod.js';

/** The most cards Browse's Up next shelf holds. */
export const UP_NEXT_MAX = 10;

/** Which shelf: Up next, or your second most recent book and show. */
export const FeedShelfId = z.enum(['up-next', 'second-recent']).openapi('FeedShelfId');
export type FeedShelfId = z.infer<typeof FeedShelfId>;

/** What a card plays: a book, or an episode. */
export const FeedCardKind = z.enum(['book', 'episode']).openapi('FeedCardKind');
export type FeedCardKind = z.infer<typeof FeedCardKind>;

/**
 * One card: a book with its authors and art, or an episode with its show's title and art (`sub`,
 * `art`); how far through it you are (null when not started), and where you stand with it.
 */
export const FeedCard = z
  .object({
    ref: MediaRef,
    kind: FeedCardKind,
    title: z.string(),
    sub: z.string().nullable(),
    art: ArtUrl.nullable(),
    progress: Fraction.nullable(),
    availability: Availability,
  })
  .openapi('FeedCard');
export type FeedCard = z.infer<typeof FeedCard>;

/** One shelf and its cards, in the order Browse draws them. */
export const FeedShelf = z
  .object({ id: FeedShelfId, items: z.array(FeedCard).min(1).max(UP_NEXT_MAX) })
  .openapi('FeedShelf');
export type FeedShelf = z.infer<typeof FeedShelf>;

/**
 * Browse's shelves: Up next, then the second most recent, which holds at most one book and one
 * episode. An empty shelf is left out.
 */
export const Feed = z
  .object({ shelves: z.array(FeedShelf) })
  .superRefine((value, ctx) => {
    const ids = value.shelves.map((s) => s.id);
    const order = FeedShelfId.options.filter((id) => ids.includes(id));
    if (ids.length !== order.length || ids.some((id, i) => id !== order[i])) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['shelves'], message: 'out of order' });
    }
    value.shelves.forEach((shelf, i) => {
      const kinds = shelf.items.map((card) => card.kind);
      if (shelf.id === 'second-recent' && new Set(kinds).size !== kinds.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shelves', i, 'items'],
          message: 'more than one of a kind',
        });
      }
    });
  })
  .openapi('Feed');
export type Feed = z.infer<typeof Feed>;
