import { ItemDetail } from '@auralis/schema';
import { describe, expect, it } from 'vitest';
import { frame as album } from '../generated/pages/Album';
import { frame as book } from '../generated/pages/Book';
import { frame as episodePage } from '../generated/pages/Episode';
import { frame as show } from '../generated/pages/Show';
import { albumData, bookData, episodeData, showData } from './items';

const detail = (over: Partial<ItemDetail>): ItemDetail =>
  ItemDetail.parse({
    ref: { source: 'abs', id: 'b1' },
    kind: 'book',
    title: 'The Salt Road',
    sub: 'Rosa Elin',
    art: '/api/media/abs:b1/art',
    progress: null,
    duration: null,
    availability: { kind: 'owned' },
    chapters: [],
    episodes: [],
    tracks: [],
    ...over,
  });

describe('[M1.shell] a book’s page from GET /api/items/{ref}', () => {
  const data = bookData(
    detail({
      progress: 0.25,
      duration: 7200,
      chapters: [
        { title: 'Prologue', start: 0, end: 1080 },
        { title: 'The Harbour', start: 1080, end: 4800 },
        { title: 'Low Tide', start: 4800, end: 7200 },
      ],
    }),
    book.placeholder,
  );

  it('heads the page with the book, its author, art, progress, length and what is left', () => {
    expect(data).toMatchObject({
      ref: 'abs:b1',
      title: 'The Salt Road',
      kind: book.placeholder.kind,
      author: 'Rosa Elin',
      image: '/api/media/abs:b1/art?size=medium',
      progress: 0.25,
      meta: '2 h 0 m · 1 h 30 m left',
    });
  });

  it('lists its chapters with where each starts and how long it is, marking the one you are in', () => {
    expect(data.chapters).toEqual([
      { number: 1, title: 'Prologue', meta: '0:00 · 18 min', status: null, tone: null },
      {
        number: 2,
        title: 'The Harbour',
        meta: '18:00 · 1 h 2 m',
        status: '50 min left',
        tone: 'library',
      },
      { number: 3, title: 'Low Tide', meta: '1:20:00 · 40 min', status: null, tone: null },
    ]);
  });

  it('leaves what the answer does not hold empty: series, narrations, rating, more, about', () => {
    expect(data.series).toEqual({ label: '', ref: '' });
    expect(data.narrations).toEqual([]);
    expect(data.more.series.items).toEqual([]);
    expect(data.more.author.items).toEqual([]);
    expect(data.about).toBe('');
    expect(data.menu).toEqual([]);
  });

  it('draws a book with no art and no length without a broken image or a stray fact', () => {
    const bare = bookData(detail({ art: null }), book.placeholder);
    expect(bare.image).toBe('');
    expect(bare.meta).toBe('');
    expect(bare.progress).toBe(0);
  });
});

describe('[M1.shell] a show’s page from GET /api/items/{ref}', () => {
  const data = showData(
    detail({
      ref: { source: 'abs', id: 's1' },
      kind: 'show',
      title: 'Megacorp',
      art: '/api/media/abs:s1/art',
      episodes: [
        {
          ref: { source: 'abs', id: 'e2' },
          title: 'Part Two',
          description: 'The second part.',
          publishedAt: Date.UTC(2023, 8, 6),
          duration: 3120,
          progress: 0.4,
          finished: false,
        },
        {
          ref: { source: 'abs', id: 'e1' },
          title: 'Part One',
          description: null,
          publishedAt: null,
          duration: null,
          progress: null,
          finished: true,
        },
      ],
    }),
    show.placeholder,
  );

  it('heads the page with the show, its host, art and how many episodes are unplayed', () => {
    expect(data).toMatchObject({
      title: 'Megacorp',
      kind: show.placeholder.kind,
      host: 'Rosa Elin',
      image: '/api/media/abs:s1/art?size=medium',
      meta: '2 episodes · 0 unplayed',
      following: true,
      subscribe: show.placeholder.subscribe,
    });
  });

  it('lists its episodes in the show’s order, each playing by its own ref', () => {
    expect(data.episodes).toEqual([
      {
        title: 'Part Two',
        ref: 'abs:e2',
        description: 'The second part.',
        meta: ['6 Sept 2023', '52 min', '31 min left'],
        image: '/api/media/abs:s1/art?size=small',
        progress: 0.4,
        finished: false,
        absent: false,
      },
      {
        title: 'Part One',
        ref: 'abs:e1',
        description: '',
        meta: [],
        image: '/api/media/abs:s1/art?size=small',
        progress: null,
        finished: true,
        absent: false,
      },
    ]);
    expect(data.related).toEqual([]);
    expect(data.about).toBe('');
  });
});

describe('[M1.shell] an album’s page from GET /api/items/{ref}', () => {
  const id = '65de8562c54b89ceef199f91bacd8709';
  const data = albumData(
    detail({
      ref: { source: 'jellyfin', id },
      kind: 'album',
      title: 'Rumours',
      sub: 'Fleetwood Mac',
      art: `/api/media/jellyfin:${id}/art`,
      duration: 2400,
      tracks: [
        {
          ref: { source: 'jellyfin', id: '7c8b8e35e6ec0f40736aadee1f8979bb' },
          number: 1,
          title: 'Second Hand News',
          sub: 'Fleetwood Mac',
          duration: 163,
        },
        {
          ref: { source: 'jellyfin', id: '5130cb0d529d7281f503eb95c427dd7b' },
          number: null,
          title: 'Dreams',
          sub: null,
          duration: null,
        },
      ],
    }),
    album.placeholder,
  );

  it('heads the page with the album, its artist, art, track count and length, playing by its ref', () => {
    expect(data).toMatchObject({
      ref: `jellyfin:${id}`,
      title: 'Rumours',
      kind: album.placeholder.kind,
      artist: 'Fleetwood Mac',
      image: `/api/media/jellyfin:${id}/art?size=medium`,
      meta: '2 tracks · 40 min',
    });
  });

  it('lists its tracks in order, numbered as the album numbers them', () => {
    expect(data.tracks).toEqual([
      {
        number: 1,
        title: 'Second Hand News',
        meta: 'Fleetwood Mac · 2:43',
        status: null,
        menu: [],
      },
      { number: 2, title: 'Dreams', meta: '', status: null, menu: [] },
    ]);
    expect(data.more.items).toEqual([]);
    expect(data.editions).toEqual({ label: '' });
  });
});

describe('[M1.shell] an episode’s page from GET /api/items/{ref}', () => {
  const data = episodeData(
    detail({
      ref: { source: 'abs', id: 'ep-1' },
      kind: 'episode',
      title: 'The Night Ferry',
      sub: 'The Long Read',
      art: '/api/media/abs:show-1/art',
      progress: 0.5,
      duration: 3120,
      episode: {
        show: { source: 'abs', id: 'show-1' },
        description: 'A crossing logged at six hours.',
        publishedAt: Date.UTC(2026, 7, 12),
        finished: false,
      },
    }),
    episodePage.placeholder,
  );

  it('heads the page with the episode, its show to open, when it came out, its length and what is left', () => {
    expect(data).toMatchObject({
      ref: 'abs:ep-1',
      title: 'The Night Ferry',
      kind: episodePage.placeholder.kind,
      show: 'The Long Read',
      showRef: 'abs:show-1',
      meta: '12 Aug 2026 · 52 min · 26 min left',
      progress: 0.5,
      image: '/api/media/abs:show-1/art?size=medium',
      notes: 'A crossing logged at six hours.',
    });
  });

  it('lists no other episodes and no menu of the canvas’s: the show’s page lists them', () => {
    expect(data.more).toEqual([]);
    expect(data.menu).toEqual([]);
  });

  it('shows a finished episode with no progress and nothing left', () => {
    const done = episodeData(
      detail({
        ref: { source: 'abs', id: 'ep-1' },
        kind: 'episode',
        progress: null,
        duration: 600,
        episode: {
          show: { source: 'abs', id: 'show-1' },
          description: null,
          publishedAt: null,
          finished: true,
        },
      }),
      episodePage.placeholder,
    );
    expect(done).toMatchObject({ meta: '10 min', progress: 0, notes: '' });
  });
});
