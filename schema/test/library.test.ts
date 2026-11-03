import { describe, expect, it } from 'vitest';
import { generateKotlin } from '../codegen/kotlin.js';
import { buildOpenApiDocument } from '../codegen/openapi.js';
import {
  ArtQuery,
  Availability,
  ErrorResponse,
  getItem,
  ItemDetail,
  ItemParams,
  LibraryList,
  LibraryParams,
  LibraryQuery,
  listLibrary,
  mediaArt,
  type Route,
  routes,
} from '../src/index.js';

const book = { source: 'abs', id: '7b3fa64c-f00c-4de6-8cd5-15d301b91f4b' } as const;
const show = { source: 'abs', id: 'e6751961-0000-4000-8000-000000000000' } as const;
const episode = { source: 'abs', id: 'ep_1' } as const;
const album = { source: 'jellyfin', id: '65de8562c54b89ceef199f91bacd8709' } as const;
const track = { source: 'jellyfin', id: '7c8b8e35000000000000000000000000' } as const;

const owned = { kind: 'owned' } as const;

const header = {
  title: 'Powers',
  sub: 'Ursula K. Le Guin',
  art: `/api/media/abs:${book.id}/art`,
  progress: 0.25,
  duration: 46578,
  availability: owned,
};

describe('availability', () => {
  it('says the item is owned, streamable, requested with its status and progress, or external', () => {
    for (const value of [
      { kind: 'owned' },
      { kind: 'streamable' },
      { kind: 'requested', status: 'requested' },
      { kind: 'requested', status: 'downloading', progress: 0.87 },
      { kind: 'requested', status: 'needsChoice' },
      { kind: 'requested', status: 'failed' },
      { kind: 'external', requestable: true },
      { kind: 'external', requestable: false },
    ]) {
      expect(Availability.parse(value), JSON.stringify(value)).toEqual(value);
    }
  });

  it('refuses a request without its status, and an external item without whether it is requestable', () => {
    expect(Availability.safeParse({ kind: 'requested' }).success).toBe(false);
    expect(Availability.safeParse({ kind: 'external' }).success).toBe(false);
  });

  it('refuses request details on what is not requested, and requestable on what is not external', () => {
    expect(Availability.safeParse({ kind: 'owned', status: 'failed' }).success).toBe(false);
    expect(Availability.safeParse({ kind: 'streamable', progress: 0.5 }).success).toBe(false);
    expect(Availability.safeParse({ kind: 'owned', requestable: true }).success).toBe(false);
    expect(
      Availability.safeParse({ kind: 'requested', status: 'requested', requestable: true }).success,
    ).toBe(false);
    expect(
      Availability.safeParse({ kind: 'external', requestable: true, status: 'failed' }).success,
    ).toBe(false);
  });

  it('carries download progress only while the request is downloading', () => {
    for (const status of ['requested', 'needsChoice', 'failed']) {
      expect(
        Availability.safeParse({ kind: 'requested', status, progress: 0.5 }).success,
        status,
      ).toBe(false);
    }
    expect(
      Availability.safeParse({ kind: 'requested', status: 'downloading', progress: 0.5 }).success,
    ).toBe(true);
  });

  it('keeps download progress between 0 and 1', () => {
    expect(
      Availability.safeParse({ kind: 'requested', status: 'downloading', progress: 1.2 }).success,
    ).toBe(false);
  });
});

describe('a library list', () => {
  it('lists books, podcasts or music, by medium', () => {
    for (const medium of ['books', 'podcasts', 'music']) {
      expect(LibraryParams.parse({ medium })).toEqual({ medium });
    }
    expect(LibraryParams.safeParse({ medium: 'episodes' }).success).toBe(false);
  });

  it('gives each entry its ref, kind, title, sub, art, progress and availability', () => {
    const list = {
      items: [
        {
          ref: book,
          kind: 'book',
          title: 'Powers',
          sub: 'Ursula K. Le Guin',
          art: `/api/media/abs:${book.id}/art`,
          progress: 0.25,
          availability: owned,
        },
        {
          ref: album,
          kind: 'album',
          title: 'An album',
          sub: null,
          art: null,
          progress: null,
          availability: owned,
        },
      ],
      sort: 'title',
      seed: null,
    };
    expect(LibraryList.parse(list)).toEqual(list);
  });

  it('[M2.sorting/a] sorts by title unless asked for artist or random, and takes a seed only as a whole number from 0 to 2^32-1', () => {
    expect(LibraryQuery.parse({})).toEqual({ sort: 'title' });
    for (const sort of ['title', 'artist', 'random']) {
      expect(LibraryQuery.parse({ sort })).toEqual({ sort });
    }
    expect(LibraryQuery.parse({ sort: 'random', seed: '42' })).toEqual({
      sort: 'random',
      seed: 42,
    });
    expect(LibraryQuery.parse({ seed: '0' })).toEqual({ sort: 'title', seed: 0 });
    expect(LibraryQuery.parse({ seed: '4294967295' }).seed).toBe(4294967295);
    for (const query of [
      { sort: 'size' },
      { seed: '-1' },
      { seed: '4294967296' },
      { seed: '1.5' },
      { seed: '' },
      { seed: '0x10' },
      { seed: 'abc' },
    ]) {
      expect(LibraryQuery.safeParse(query).success, JSON.stringify(query)).toBe(false);
    }
  });

  it('[M2.sorting/a] answers the sort it used, and the seed only for random', () => {
    const answered = (sort: string, seed: number | null) =>
      LibraryList.safeParse({ items: [], sort, seed }).success;
    expect(answered('title', null)).toBe(true);
    expect(answered('artist', null)).toBe(true);
    expect(answered('random', 7)).toBe(true);
    expect(answered('random', null)).toBe(false);
    expect(answered('title', 7)).toBe(false);
  });

  it('refuses progress outside 0 to 1, a kind no list holds, and art not served by this server', () => {
    const entry = {
      ref: book,
      kind: 'book',
      title: 'Powers',
      sub: null,
      art: null,
      progress: null,
      availability: owned,
    };
    const list = (item: object) => ({ items: [item], sort: 'title', seed: null });
    expect(LibraryList.safeParse(list({ ...entry, progress: 1.5 })).success).toBe(false);
    expect(LibraryList.safeParse(list({ ...entry, kind: 'episode' })).success).toBe(false);
    expect(
      LibraryList.safeParse(list({ ...entry, art: 'http://elsewhere/cover.jpg' })).success,
    ).toBe(false);
  });
});

describe('an item page', () => {
  it('opens a book, show or album by its ref as it sits in a path', () => {
    expect(ItemParams.parse({ ref: `abs:${book.id}` })).toEqual({ ref: `abs:${book.id}` });
    expect(ItemParams.safeParse({ ref: 'abs:../etc' }).success).toBe(false);
  });

  it("holds a book's header and its chapters", () => {
    const page = {
      ref: book,
      kind: 'book',
      ...header,
      chapters: [
        { title: 'Chapter 1', start: 0, end: 1200 },
        { title: 'Chapter 2', start: 1200, end: 2500 },
      ],
      episodes: [],
      tracks: [],
    };
    expect(ItemDetail.parse(page)).toEqual(page);
  });

  it("holds a show's episodes in its order, each with its own progress", () => {
    const page = {
      ref: show,
      kind: 'show',
      ...header,
      progress: null,
      duration: null,
      chapters: [],
      episodes: [
        {
          ref: episode,
          title: 'An episode',
          description: null,
          publishedAt: 1_760_000_000_000,
          duration: 3120,
          progress: 0.4,
          finished: false,
        },
      ],
      tracks: [],
    };
    expect(ItemDetail.parse(page)).toEqual(page);
  });

  it("holds an album's tracks, numbered, with their artist", () => {
    const page = {
      ref: album,
      kind: 'album',
      ...header,
      progress: null,
      chapters: [],
      episodes: [],
      tracks: [{ ref: track, number: 1, title: 'A track', sub: 'An artist', duration: 242 }],
    };
    expect(ItemDetail.parse(page)).toEqual(page);
  });

  it("holds an episode's own page: its show, notes, published date and whether you finished it", () => {
    const page = {
      ref: episode,
      kind: 'episode',
      ...header,
      chapters: [],
      episodes: [],
      tracks: [],
      episode: { show, description: 'Notes', publishedAt: 1_760_000_000_000, finished: false },
    };
    expect(ItemDetail.parse(page)).toEqual(page);
  });

  it('refuses an episode page without its show, and episode details on any other page', () => {
    const empty = { chapters: [], episodes: [], tracks: [] };
    const about = { show, description: null, publishedAt: null, finished: true };
    expect(
      ItemDetail.safeParse({ ref: episode, kind: 'episode', ...header, ...empty }).success,
    ).toBe(false);
    for (const kind of ['book', 'show', 'album'] as const) {
      const page = { ref: book, kind, ...header, ...empty, episode: about };
      expect(ItemDetail.safeParse(page).success, kind).toBe(false);
    }
  });

  it('refuses chapters on anything but a book, episodes on anything but a show, and tracks on anything but an album', () => {
    const chapter = { title: 'Chapter 1', start: 0, end: 10 };
    const ep = {
      ref: episode,
      title: 'An episode',
      description: null,
      publishedAt: null,
      duration: null,
      progress: null,
      finished: false,
    };
    const tr = { ref: track, number: null, title: 'A track', sub: null, duration: null };
    const empty = { chapters: [], episodes: [], tracks: [] };
    for (const [kind, extra] of [
      ['show', { chapters: [chapter] }],
      ['album', { chapters: [chapter] }],
      ['book', { episodes: [ep] }],
      ['album', { episodes: [ep] }],
      ['book', { tracks: [tr] }],
      ['show', { tracks: [tr] }],
    ] as const) {
      const page = { ref: book, kind, ...header, ...empty, ...extra };
      expect(ItemDetail.safeParse(page).success, `${kind} ${Object.keys(extra)[0]}`).toBe(false);
    }
  });
});

describe('the shell’s shapes in the generated clients', () => {
  const answering = (operationId: string, response: Route['response']): Route => ({
    method: 'GET',
    path: `/api/${operationId}`,
    operationId,
    summary: operationId,
    responseDescription: operationId,
    response,
    access: 'member',
  });

  it('generate Kotlin models, availability as one class with its kind and optional details', () => {
    const doc = buildOpenApiDocument(
      [answering('library', LibraryList), answering('item', ItemDetail)],
      ErrorResponse,
    );
    const kotlin = generateKotlin(JSON.parse(JSON.stringify(doc)) as object, 'test');
    expect(kotlin).toContain('data class LibraryEntry(');
    expect(kotlin).toContain('data class ItemDetail(');
    expect(kotlin).toContain(
      [
        'data class Availability(',
        '    val kind: AvailabilityKind,',
        '    val status: RequestStatus? = null,',
        '    val progress: Double? = null,',
        '    val requestable: Boolean? = null,',
        ')',
      ].join('\n'),
    );
  });
});

describe('the library route', () => {
  it('[M2.sorting/a] lists one medium for a signed-in member, at /api/library/{medium}?sort&seed', () => {
    expect(routes).toContain(listLibrary);
    expect(listLibrary).toMatchObject({
      method: 'GET',
      path: '/api/library/{medium}',
      access: 'member',
      params: LibraryParams,
      query: LibraryQuery,
      response: LibraryList,
    });
    const doc = buildOpenApiDocument([listLibrary], ErrorResponse) as {
      paths: Record<string, { get: { parameters: { name: string; in: string }[] } }>;
    };
    const parameters = doc.paths['/api/library/{medium}']?.get.parameters ?? [];
    expect(parameters.map((p) => [p.name, p.in])).toEqual([
      ['medium', 'path'],
      ['sort', 'query'],
      ['seed', 'query'],
    ]);
  });
});

describe('the item route', () => {
  it('opens one book, show or album for a signed-in member, at /api/items/{ref}', () => {
    expect(routes).toContain(getItem);
    expect(getItem).toMatchObject({
      method: 'GET',
      path: '/api/items/{ref}',
      access: 'member',
      params: ItemParams,
      response: ItemDetail,
    });
  });
});

describe('the art route', () => {
  it("streams a book's, show's or album's art for a signed-in member, at /api/media/{ref}/art", () => {
    expect(routes).toContain(mediaArt);
    expect(mediaArt).toMatchObject({
      method: 'GET',
      path: '/api/media/{ref}/art',
      access: 'member',
      params: ItemParams,
      query: ArtQuery,
      stream: 'image',
    });
  });

  it('takes an optional size, small, medium or large, and nothing else', () => {
    for (const query of [{}, { size: 'small' }, { size: 'medium' }, { size: 'large' }]) {
      expect(ArtQuery.parse(query)).toEqual(query);
    }
    expect(ArtQuery.safeParse({ size: '4000' }).success).toBe(false);
  });

  it('is described as an image, whole, with no ranges', () => {
    const doc = buildOpenApiDocument([mediaArt], ErrorResponse) as {
      paths: Record<
        string,
        {
          get: {
            parameters: { name: string; in: string }[];
            responses: Record<string, { content?: Record<string, unknown> }>;
          };
        }
      >;
    };
    const get = doc.paths['/api/media/{ref}/art']?.get;
    expect(get?.parameters.map((p) => [p.name, p.in])).toEqual([
      ['ref', 'path'],
      ['size', 'query'],
    ]);
    expect(Object.keys(get?.responses ?? {})).toEqual(['200', '400', '401', '403']);
    expect(Object.keys(get?.responses['200']?.content ?? {})).toEqual(['image/*']);
  });
});
