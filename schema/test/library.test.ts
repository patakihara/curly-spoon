import { describe, expect, it } from 'vitest';
import { generateKotlin } from '../codegen/kotlin.js';
import { buildOpenApiDocument } from '../codegen/openapi.js';
import {
  Availability,
  ErrorResponse,
  ItemDetail,
  ItemParams,
  LibraryList,
  LibraryParams,
  listLibrary,
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
    };
    expect(LibraryList.parse(list)).toEqual(list);
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
    expect(LibraryList.safeParse({ items: [{ ...entry, progress: 1.5 }] }).success).toBe(false);
    expect(LibraryList.safeParse({ items: [{ ...entry, kind: 'episode' }] }).success).toBe(false);
    expect(
      LibraryList.safeParse({ items: [{ ...entry, art: 'http://elsewhere/cover.jpg' }] }).success,
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
  it('lists one medium for a signed-in member, at /api/library/{medium}', () => {
    expect(routes).toContain(listLibrary);
    expect(listLibrary).toMatchObject({
      method: 'GET',
      path: '/api/library/{medium}',
      access: 'member',
      params: LibraryParams,
      response: LibraryList,
    });
    const doc = buildOpenApiDocument([listLibrary], ErrorResponse) as {
      paths: Record<string, { get: { parameters: { name: string; in: string }[] } }>;
    };
    const parameters = doc.paths['/api/library/{medium}']?.get.parameters ?? [];
    expect(parameters.map((p) => [p.name, p.in])).toEqual([['medium', 'path']]);
  });
});
