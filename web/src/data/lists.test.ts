import { ListDetail, type ListItem } from '@auralis/schema';
import { describe, expect, it } from 'vitest';
import { frame as list } from '../generated/pages/List';
import { listCards, listData } from './lists';

const episode = (over: Partial<ListItem> = {}): ListItem => ({
  ref: { source: 'abs', id: 'ep-1' },
  kind: 'episode',
  title: 'Part One',
  sub: 'Megacorp',
  art: '/api/media/abs:s1/art',
  publishedAt: Date.UTC(2026, 7, 12),
  duration: 3120,
  progress: null,
  finished: false,
  ...over,
});

const detail = (over: Partial<ListDetail> = {}): ListDetail =>
  ListDetail.parse({
    id: 'list-1',
    kind: 'playlist',
    name: 'Commute',
    theDigest: false,
    order: null,
    count: 1,
    shows: [],
    items: [episode()],
    ...over,
  });

describe('[M2.lists] a list page from GET /api/lists/{id}', () => {
  it('[M2.lists] names a playlist by its kind, and draws each episode with its show, date and length', () => {
    const data = listData(detail(), list.placeholder);
    expect(data).toMatchObject({
      title: 'Commute',
      ref: 'list-1',
      kind: 'Playlist',
      meta: '1 episode',
      covers: ['/api/media/abs:s1/art?size=medium'],
      menu: [],
      shows: [],
      order: '',
    });
    expect(data.items).toEqual([
      {
        title: 'Part One',
        ref: 'abs:ep-1',
        description: '',
        meta: ['Megacorp', '12 Aug 2026', '52 min'],
        image: '/api/media/abs:s1/art?size=small',
        progress: null,
      },
    ]);
  });

  it('[M2.lists] says what is left of an episode begun', () => {
    const [item] = listData(
      detail({ items: [episode({ progress: 0.4 })] }),
      list.placeholder,
    ).items;
    expect(item!.meta).toEqual(['Megacorp', '12 Aug 2026', '52 min', '31 min left']);
    expect(item!.progress).toBe(0.4);
  });

  it("[M2.lists] draws a digest with its shows, its order and its shows' covers", () => {
    const data = listData(
      detail({
        kind: 'digest',
        name: 'The Digest',
        theDigest: true,
        order: 'newest',
        count: 2,
        shows: [
          {
            ref: { source: 'abs', id: 's1' },
            kind: 'show',
            title: 'Megacorp',
            sub: 'A Host',
            art: '/api/media/abs:s1/art',
            progress: null,
            availability: { kind: 'owned' },
          },
        ],
        items: [episode(), episode({ ref: { source: 'abs', id: 'ep-2' }, title: 'Part Two' })],
      }),
      list.placeholder,
    );
    expect(data.kind).toBe('Digest');
    expect(data.meta).toBe('1 show · 2 episodes · newest first');
    expect(data.order).toBe('Newest first');
    expect(data.covers).toEqual(['/api/media/abs:s1/art?size=medium']);
    expect(data.shows).toEqual([
      {
        title: 'Megacorp',
        sub: 'A Host',
        image: '/api/media/abs:s1/art?size=small',
        ref: 'abs:s1',
      },
    ]);
  });

  it('[M2.lists] counts a listening list by its books and shows, a book with its author and length', () => {
    const data = listData(
      detail({
        kind: 'listening',
        count: 2,
        items: [
          episode({
            ref: { source: 'abs', id: 'b1' },
            kind: 'book',
            title: 'The Salt Road',
            sub: 'Rosa Elin',
            publishedAt: null,
            duration: 36_000,
          }),
          episode({
            ref: { source: 'abs', id: 's1' },
            kind: 'show',
            sub: 'A Host',
            publishedAt: null,
            duration: null,
          }),
        ],
      }),
      list.placeholder,
    );
    expect(data.kind).toBe('List');
    expect(data.meta).toBe('1 book · 1 show');
    expect(data.items.map((i) => i.meta)).toEqual([['Rosa Elin', '10 h 0 m'], ['A Host']]);
  });

  it('[M2.lists] draws an entry with no art and no show without a broken image or a stray word', () => {
    const [item] = listData(
      detail({ items: [episode({ art: null, sub: null, publishedAt: null, duration: null })] }),
      list.placeholder,
    ).items;
    expect(item!.image).toBe('');
    expect(item!.meta).toEqual([]);
  });
});

describe("[M2.lists] the Podcasts page's lists from GET /api/lists", () => {
  it('[M2.lists] draws each list as a card naming its kind and size, covered by its entries, opening its page', () => {
    const cards = listCards([
      detail({
        kind: 'digest',
        name: 'The Digest',
        theDigest: true,
        order: 'oldest',
        count: 0,
        items: [],
      }),
      detail({ count: 1 }),
    ]);
    expect(cards).toEqual([
      { title: 'The Digest', ref: 'list-1', sub: 'Digest · 0 episodes', covers: [] },
      {
        title: 'Commute',
        ref: 'list-1',
        sub: 'Playlist · 1 episode',
        covers: ['/api/media/abs:s1/art?size=medium'],
      },
    ]);
  });
});
