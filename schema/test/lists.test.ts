import { describe, expect, it } from 'vitest';
import { generateKotlin } from '../codegen/kotlin.js';
import { buildOpenApiDocument } from '../codegen/openapi.js';
import {
  addListItem,
  CreateListBody,
  createList,
  deleteList,
  ErrorResponse,
  getList,
  LIST_ENTRIES_MAX,
  ListDetail,
  ListSummary,
  ListSummaryList,
  listLists,
  PutListItemsBody,
  Queue,
  routes,
  setListItems,
  UpdateListBody,
  updateList,
} from '../src/index.js';

const show = { source: 'abs', id: 'e6751961-22eb-4064-8987-b75bfe655929' } as const;
const episode = { source: 'abs', id: '3b93ba7a-33ef-417f-bb5d-637a272d6107' } as const;

describe('a new list', () => {
  it('takes a kind and a trimmed name, and for a digest its shows and order', () => {
    expect(
      CreateListBody.parse({ kind: 'digest', name: '  News  ', shows: [show], order: 'newest' }),
    ).toEqual({ kind: 'digest', name: 'News', shows: [show], order: 'newest' });
    expect(CreateListBody.parse({ kind: 'playlist', name: 'Drive' })).toEqual({
      kind: 'playlist',
      name: 'Drive',
    });
  });

  it('refuses an empty name, a name of only spaces, a kind no list has, and too many shows', () => {
    for (const body of [
      { kind: 'playlist', name: '' },
      { kind: 'playlist', name: '   ' },
      { kind: 'queue', name: 'Drive' },
      {
        kind: 'digest',
        name: 'All',
        shows: Array.from({ length: LIST_ENTRIES_MAX + 1 }, () => show),
      },
    ]) {
      expect(CreateListBody.safeParse(body).success, JSON.stringify(body).slice(0, 60)).toBe(false);
    }
  });

  it('changes a name, an order or shows, any of them, and refuses an empty name', () => {
    expect(UpdateListBody.parse({})).toEqual({});
    expect(UpdateListBody.parse({ order: 'oldest', shows: [] })).toEqual({
      order: 'oldest',
      shows: [],
    });
    expect(UpdateListBody.safeParse({ name: ' ' }).success).toBe(false);
    expect(PutListItemsBody.safeParse({ refs: [episode, { source: 'abs' }] }).success).toBe(false);
  });
});

describe('your lists', () => {
  it('give each list the covers its card draws and how many of each kind it shows, without opening it', () => {
    const summary = {
      id: 'l2',
      kind: 'listening',
      name: 'Books',
      theDigest: false,
      order: null,
      count: 3,
      covers: ['/api/media/abs:b1/art', '/api/media/abs:s1/art'],
      counts: { book: 2, show: 1, episode: 0 },
    };
    expect(ListSummaryList.parse({ lists: [summary] }).lists).toEqual([summary]);
    expect(ListSummary.safeParse({ ...summary, covers: ['https://elsewhere/art'] }).success).toBe(
      false,
    );
    expect(ListSummary.safeParse({ ...summary, counts: { book: 2, show: 1 } }).success).toBe(false);
  });
});

describe('a list opened', () => {
  it('holds its summary, a digest’s shows, and its entries with when each was published and whether you finished it', () => {
    const detail = {
      id: 'l1',
      kind: 'digest',
      name: 'The Digest',
      theDigest: true,
      order: 'oldest',
      count: 1,
      covers: [`/api/media/abs:${show.id}/art`],
      counts: { book: 0, show: 0, episode: 1 },
      shows: [
        {
          ref: show,
          kind: 'show',
          title: 'Marshall Islands',
          sub: null,
          art: `/api/media/abs:${show.id}/art`,
          progress: null,
          availability: { kind: 'owned' },
        },
      ],
      items: [
        {
          ref: episode,
          kind: 'episode',
          title: 'Part One',
          sub: 'Marshall Islands',
          art: `/api/media/abs:${show.id}/art`,
          publishedAt: 1672531200000,
          duration: 2248.9,
          progress: null,
          finished: false,
        },
      ],
    };
    expect(ListDetail.parse(detail)).toEqual(detail);
    expect(
      ListDetail.safeParse({ ...detail, items: [{ ...detail.items[0], kind: 'album' }] }).success,
    ).toBe(false);
  });

  it('says which digest a spoken queue is the own queue of, or none', () => {
    const queue = {
      type: 'spoken',
      current: null,
      position: null,
      user: [],
      context: null,
      rev: 0,
    };
    expect(Queue.safeParse(queue).success).toBe(false);
    expect(Queue.parse({ ...queue, digest: 'l1' }).digest).toBe('l1');
    expect(Queue.parse({ ...queue, digest: null }).digest).toBeNull();
  });
});

describe('the list routes', () => {
  const listRoutes = [
    listLists,
    createList,
    getList,
    updateList,
    deleteList,
    addListItem,
    setListItems,
  ];

  it('are each served, for a signed-in member, under /api/lists', () => {
    for (const route of listRoutes) {
      expect(routes).toContain(route);
      expect(route.access).toBe('member');
      expect(route.path.startsWith('/api/lists')).toBe(true);
    }
    expect(listRoutes.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /api/lists',
      'POST /api/lists',
      'GET /api/lists/{id}',
      'PATCH /api/lists/{id}',
      'DELETE /api/lists/{id}',
      'POST /api/lists/{id}/items',
      'PUT /api/lists/{id}/items',
    ]);
  });

  it('describe a list in both generated clients', () => {
    const doc = buildOpenApiDocument(listRoutes, ErrorResponse);
    const kotlin = generateKotlin(JSON.parse(JSON.stringify(doc)) as object, 'test');
    expect(kotlin).toContain('data class ListDetail(');
    expect(kotlin).toContain('data class ListItem(');
    expect(kotlin).toContain('enum class DigestOrder');
  });
});
