import { describe, expect, it } from 'vitest';
import { generateKotlin } from '../codegen/kotlin.js';
import { buildOpenApiDocument } from '../codegen/openapi.js';
import { ErrorResponse, Feed, getFeed, routes, UP_NEXT_MAX } from '../src/index.js';

const book = { source: 'abs', id: '7b3fa64c-f00c-4de6-8cd5-15d301b91f4b' } as const;
const episode = { source: 'abs', id: 'ep_1' } as const;
const show = { source: 'abs', id: 'e6751961-0000-4000-8000-000000000000' } as const;
const owned = { kind: 'owned' } as const;

const bookCard = {
  ref: book,
  kind: 'book',
  title: 'Powers',
  sub: 'Ursula K. Le Guin',
  art: `/api/media/abs:${book.id}/art`,
  progress: 0.25,
  availability: owned,
} as const;
const episodeCard = {
  ref: episode,
  kind: 'episode',
  title: 'Part Two',
  sub: 'A show',
  art: `/api/media/abs:${show.id}/art`,
  progress: null,
  availability: owned,
} as const;

describe('[M2.sorting/b] Browse’s shelves', () => {
  it('[M2.sorting/b] hold Up next, then the second most recent, each card a book or an episode with its sub, art, progress and availability', () => {
    const feed = {
      shelves: [
        { id: 'up-next', items: [episodeCard, bookCard] },
        { id: 'second-recent', items: [bookCard, episodeCard] },
      ],
    };
    expect(Feed.parse(feed)).toEqual(feed);
    expect(Feed.parse({ shelves: [] })).toEqual({ shelves: [] });
    expect(Feed.parse({ shelves: [{ id: 'second-recent', items: [bookCard] }] })).toBeTruthy();
  });

  it('refuses an empty shelf, shelves out of order or twice, and more cards than Up next holds', () => {
    const refused = (shelves: unknown[]) => Feed.safeParse({ shelves }).success;
    expect(refused([{ id: 'up-next', items: [] }])).toBe(false);
    expect(
      refused([
        { id: 'second-recent', items: [bookCard] },
        { id: 'up-next', items: [bookCard] },
      ]),
    ).toBe(false);
    expect(
      refused([
        { id: 'up-next', items: [bookCard] },
        { id: 'up-next', items: [bookCard] },
      ]),
    ).toBe(false);
    expect(
      refused([{ id: 'up-next', items: Array.from({ length: UP_NEXT_MAX + 1 }, () => bookCard) }]),
    ).toBe(false);
    expect(refused([{ id: 'quick-picks', items: [bookCard] }])).toBe(false);
  });

  it('refuses a second shelf of two books or two episodes, a card of a show or album, and progress past 1', () => {
    const refused = (shelves: unknown[]) => Feed.safeParse({ shelves }).success;
    expect(refused([{ id: 'second-recent', items: [bookCard, bookCard] }])).toBe(false);
    expect(refused([{ id: 'second-recent', items: [episodeCard, episodeCard] }])).toBe(false);
    expect(refused([{ id: 'up-next', items: [{ ...bookCard, kind: 'show' }] }])).toBe(false);
    expect(refused([{ id: 'up-next', items: [{ ...bookCard, kind: 'album' }] }])).toBe(false);
    expect(refused([{ id: 'up-next', items: [{ ...bookCard, progress: 1.5 }] }])).toBe(false);
  });
});

describe('the feed route', () => {
  it('[M2.sorting/b] serves Browse’s shelves to a signed-in member, at /api/feed', () => {
    expect(routes).toContain(getFeed);
    expect(getFeed).toMatchObject({
      method: 'GET',
      path: '/api/feed',
      access: 'member',
      response: Feed,
    });
    expect('params' in getFeed || 'query' in getFeed).toBe(false);
  });

  it('describes the shelves in both generated clients', () => {
    const doc = buildOpenApiDocument([getFeed], ErrorResponse);
    const kotlin = generateKotlin(JSON.parse(JSON.stringify(doc)) as object, 'test');
    expect(kotlin).toContain('data class Feed(');
    expect(kotlin).toContain('data class FeedCard(');
    expect(kotlin).toContain('enum class FeedShelfId');
  });
});
