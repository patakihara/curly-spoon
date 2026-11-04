import { type FeedCard, type LibraryEntry, LibraryList } from '@auralis/schema';
import { describe, expect, it } from 'vitest';
import { frame as books } from '../generated/pages/Books';
import { frame as browse } from '../generated/pages/Browse';
import { frame as music } from '../generated/pages/Music';
import { frame as podcasts } from '../generated/pages/Podcasts';
import {
  booksData,
  browseData,
  libraryAwaited,
  musicData,
  podcastsData,
  statusOf,
  homeState,
} from './library';

const entry = (over: Partial<LibraryEntry>): LibraryEntry => ({
  ref: { source: 'abs', id: 'b1' },
  kind: 'book',
  title: 'The Salt Road',
  sub: 'Rosa Elin',
  art: '/api/media/abs:b1/art',
  progress: null,
  availability: { kind: 'owned' },
  ...over,
});

const list = (...items: LibraryEntry[]) =>
  LibraryList.parse({ items, requested: [], sort: 'title', seed: null });
const noFeed = { shelves: [] };

describe('[M3.requests/c] your own requests sit among your items', () => {
  const asked = {
    id: 'r1',
    title: 'Asked For',
    sub: 'An Author',
    art: null,
    availability: { kind: 'requested', status: 'downloading', progress: 0.5 },
  };
  const withRequest = (kind: 'book' | 'album') =>
    LibraryList.parse({
      items: [],
      requested: [{ ...asked, kind }],
      sort: 'title',
      seed: null,
    });

  it('[M3.requests/c] draws a book on its way among the books, with its status', () => {
    expect(booksData(withRequest('book'), books.placeholder).library).toEqual([
      expect.objectContaining({
        title: 'Asked For',
        status: 'Downloading · 50%',
        tone: 'progress',
      }),
    ]);
  });

  it('[M3.requests/c] draws an album on its way among the music, with its status', () => {
    expect(musicData(withRequest('album'), music.placeholder).library).toEqual([
      expect.objectContaining({
        title: 'Asked For',
        status: 'Downloading · 50%',
        tone: 'progress',
      }),
    ]);
  });
});

describe('[M3.requests/c] a request among the items', () => {
  const asked = (title: string) => ({
    id: title,
    kind: 'book',
    title,
    sub: 'An Author',
    art: null,
    availability: { kind: 'requested', status: 'queued' },
  });
  const listed = (sort: 'title' | 'random', ...requested: ReturnType<typeof asked>[]) =>
    LibraryList.parse({
      items: [entry({ title: 'Bravo' }), entry({ title: 'Delta' })],
      requested,
      sort,
      seed: sort === 'random' ? 7 : null,
    });
  const titles = (list: LibraryList) =>
    booksData(list, books.placeholder).library.map((c) => c.title);

  it('[M3.requests/c] sits where the list’s order puts it', () => {
    expect(titles(listed('title', asked('Alpha'), asked('Charlie'), asked('Echo')))).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
      'Delta',
      'Echo',
    ]);
  });

  it('[M3.requests/c] goes after the items in a shuffle', () => {
    expect(titles(listed('random', asked('Alpha')))).toEqual(['Bravo', 'Delta', 'Alpha']);
  });

  it('[M3.requests/c] opens nothing yet, so its card draws greyed', () => {
    const cards = booksData(listed('title', asked('Alpha')), books.placeholder).library;
    expect(cards[0]).toMatchObject({ ref: '', status: 'Queued', tone: 'progress' });
  });

  it('[M3.requests/c] a home is empty with nothing of yours, and full with a request', () => {
    expect(homeState([])).toBe('empty');
    expect(homeState(booksData(listed('title', asked('Alpha')), books.placeholder).library)).toBe(
      'full',
    );
  });
});

describe('[M1.shell] the library homes from GET /api/library/{medium}', () => {
  it('lists each book as a card that opens its page by its ref, with its author, art and progress', () => {
    const data = booksData(list(entry({ progress: 0.35 })), books.placeholder);
    expect(data.library).toEqual([
      {
        title: 'The Salt Road',
        ref: 'abs:b1',
        sub: 'Rosa Elin',
        image: '/api/media/abs:b1/art?size=medium',
        progress: 0.35,
        status: null,
        tone: null,
      },
    ]);
    // The page's own words stay as the canvas has them.
    expect(data.tabs).toEqual(books.placeholder.tabs);
    expect(data.sort).toEqual({ ...books.placeholder.sort, value: 'Title' });
  });

  it('draws a card with no art and no author without a broken image or a stray word', () => {
    const [card] = booksData(list(entry({ art: null, sub: null })), books.placeholder).library;
    expect(card!.image).toBe('');
    expect(card!.sub).toBe('');
  });

  it('lists each show by its host, then the lists given', () => {
    const show = entry({
      ref: { source: 'abs', id: 's1' },
      kind: 'show',
      title: 'Megacorp',
      art: '/api/media/abs:s1/art',
    });
    const lists = [{ title: 'The Digest', ref: 'l1', sub: 'Digest · 0 episodes', covers: [] }];
    const data = podcastsData(list(show), lists, podcasts.placeholder);
    expect(data.library).toEqual([
      {
        title: 'Megacorp',
        ref: 'abs:s1',
        sub: 'Rosa Elin',
        image: '/api/media/abs:s1/art?size=medium',
        unplayed: false,
        status: null,
        tone: null,
      },
    ]);
    expect(data.lists).toEqual(lists);
  });

  it('[M2.lists] draws your shows and leaves the Lists section out when your lists failed', () => {
    const data = podcastsData(list(entry({ kind: 'show' })), null, podcasts.placeholder);
    expect(data.library).toHaveLength(1);
    expect(data.lists).toEqual([]);
    expect(data.sections).toEqual(podcasts.placeholder.sections.filter((s) => s !== 'Lists'));
    expect(
      podcastsData(list(), [], podcasts.placeholder).sections,
      'no lists is not a failure: the section stays',
    ).toEqual(podcasts.placeholder.sections);
  });

  it('lists each album by its artist', () => {
    const id = '65de8562c54b89ceef199f91bacd8709';
    const album = entry({
      ref: { source: 'jellyfin', id },
      kind: 'album',
      title: 'Rumours',
      art: `/api/media/jellyfin:${id}/art`,
    });
    expect(musicData(list(album), music.placeholder).library).toEqual([
      {
        title: 'Rumours',
        ref: `jellyfin:${id}`,
        sub: 'Rosa Elin',
        image: `/api/media/jellyfin:${id}/art?size=medium`,
        status: null,
        tone: null,
      },
    ]);
  });

  it('says where a request stands on its card, and nothing on what you own', () => {
    expect(statusOf({ kind: 'owned' })).toEqual({ status: null, tone: null });
    expect(statusOf({ kind: 'external', requestable: true })).toEqual({ status: null, tone: null });
    expect(statusOf({ kind: 'requested', status: 'downloading', progress: 0.64 })).toEqual({
      status: 'Downloading · 64%',
      tone: 'progress',
    });
    expect(statusOf({ kind: 'requested', status: 'needsChoice' })).toEqual({
      status: 'Needs choice',
      tone: 'request',
    });
    expect(statusOf({ kind: 'requested', status: 'failed' })).toEqual({
      status: 'Failed',
      tone: 'error',
    });
    expect(statusOf({ kind: 'requested', status: 'requested' })).toEqual({
      status: 'Requested',
      tone: 'request',
    });
    expect(statusOf({ kind: 'requested', status: 'searching' })).toEqual({
      status: 'Searching…',
      tone: 'progress',
    });
    expect(statusOf({ kind: 'requested', status: 'queued' })).toEqual({
      status: 'Queued',
      tone: 'progress',
    });
    expect(statusOf({ kind: 'requested', status: 'importing' })).toEqual({
      status: 'Importing',
      tone: 'progress',
    });
    expect(statusOf({ kind: 'requested', status: 'inLibrary' })).toEqual({
      status: 'In library',
      tone: 'library',
    });
  });
});

describe('[M1.shell] Browse, the home page, from the library lists', () => {
  const data = browseData(
    [
      list(
        entry({ title: 'Begun', progress: 0.4 }),
        entry({ ref: { source: 'abs', id: 'b2' }, title: 'Unstarted', progress: null }),
        entry({ ref: { source: 'abs', id: 'b3' }, title: 'Done', progress: 1 }),
      ),
      list(
        entry({
          ref: { source: 'abs', id: 's1' },
          kind: 'show',
          title: 'A Show',
          sub: 'A Host',
          progress: null,
        }),
      ),
      list(
        entry({
          ref: { source: 'jellyfin', id: 'a1' },
          kind: 'album',
          title: 'Half Heard',
          sub: 'A Band',
          art: null,
          progress: 0.5,
        }),
      ),
    ],
    noFeed,
    browse.placeholder,
  );

  it('shows in its first shelf only what you are part way through, each opening its own page', () => {
    expect(data.jumpBackIn).toEqual([
      {
        title: 'Begun',
        page: 'book',
        ref: 'abs:b1',
        sub: 'Book · Rosa Elin',
        image: '/api/media/abs:b1/art?size=medium',
      },
      { title: 'Half Heard', page: 'album', ref: 'jellyfin:a1', sub: 'Album · A Band', image: '' },
    ]);
  });

  it('shows nothing else, none of the canvas’s samples, and names every section it draws', () => {
    expect(data.sections).toEqual(
      browse.placeholder.sections.filter((s) => s !== 'Up next' && s !== 'Still listening'),
    );
    expect(data.recentlyAdded).toEqual([]);
    expect(data.people).toEqual([]);
    expect(data.pickedForYou).toEqual([]);
    expect(data.recentlyPlayed).toEqual([]);
    expect(data.feature.title).toBe('');
    expect(data.shelves.recentlyAdded).toBe('');
  });

  it('leaves its first shelf out when you are part way through nothing', () => {
    const none = browseData(
      [list(entry({ title: 'Unstarted', progress: null }))],
      noFeed,
      browse.placeholder,
    );
    expect(none.jumpBackIn).toEqual([]);
    expect(none.sections).not.toContain('Jump back in');
  });
});

describe('[M2.sorting] the library homes say the order they are in', () => {
  const sorted = (sort: 'title' | 'artist' | 'random') =>
    LibraryList.parse({ items: [], requested: [], sort, seed: sort === 'random' ? 7 : null });

  it('[M2.sorting] names the sort the server answered with, in each page’s own words', () => {
    expect(booksData(sorted('artist'), books.placeholder).sort.value).toBe('Author');
    expect(podcastsData(sorted('artist'), [], podcasts.placeholder).sort.value).toBe('Host');
    expect(musicData(sorted('artist'), music.placeholder).sort.value).toBe('Artist');
    expect(musicData(sorted('random'), music.placeholder).sort.value).toBe('Random');
    expect(booksData(sorted('title'), books.placeholder).sort.value).toBe('Title');
  });

  it('[M2.sorting] names the sort the address asks, with no cards, until its list answers', () => {
    expect(libraryAwaited(books.placeholder, 'artist')).toEqual({
      ...books.placeholder,
      sort: { ...books.placeholder.sort, value: 'Author' },
      library: [],
    });
    expect(libraryAwaited(podcasts.placeholder, 'artist').sort.value).toBe('Host');
    expect(libraryAwaited(music.placeholder, 'artist').sort.value).toBe('Artist');
    expect(libraryAwaited(music.placeholder, 'random').sort.value).toBe('Random');
    expect(libraryAwaited(books.placeholder, undefined).sort.value).toBe('Title');
  });

  it('[M2.sorting] keeps every sort to choose from, by the key the server takes', () => {
    const { sort } = booksData(sorted('random'), books.placeholder);
    expect(sort.ref).toBe('books');
    expect(sort.options.map((o) => o.key)).toEqual(['title', 'artist', 'random']);
  });
});

describe("[M2.sorting] Browse's Up next and Still listening, from GET /api/feed", () => {
  const card = (over: Partial<FeedCard>): FeedCard => ({
    ref: { source: 'abs', id: 'e1' },
    kind: 'episode',
    title: 'Part Two',
    sub: 'A Show',
    art: '/api/media/abs:s1/art',
    progress: 0.25,
    availability: { kind: 'owned' },
    ...over,
  });
  const book = card({
    ref: { source: 'abs', id: 'b1' },
    kind: 'book',
    title: 'The Salt Road',
    sub: 'Rosa Elin',
    art: null,
    progress: null,
  });

  it('[M2.sorting] shows each Up next card opening its book or episode, named by its kind', () => {
    const data = browseData(
      [],
      { shelves: [{ id: 'up-next', items: [card({}), book] }] },
      browse.placeholder,
    );
    expect(data.upNext).toEqual([
      {
        title: 'Part Two',
        page: 'episode',
        ref: 'abs:e1',
        sub: 'Episode · A Show',
        image: '/api/media/abs:s1/art?size=medium',
        progress: 0.25,
      },
      {
        title: 'The Salt Road',
        page: 'book',
        ref: 'abs:b1',
        sub: 'Book · Rosa Elin',
        image: '',
        progress: null,
      },
    ]);
    expect(data.stillListening).toEqual([]);
    expect(data.sections).toContain('Up next');
    expect(data.sections, 'no titled empty shelf').not.toContain('Still listening');
  });

  it('[M2.sorting] fills Still listening from the second shelf, and draws a card with no sub as its kind alone', () => {
    const data = browseData(
      [],
      {
        shelves: [
          { id: 'up-next', items: [card({})] },
          { id: 'second-recent', items: [card({ sub: null })] },
        ],
      },
      browse.placeholder,
    );
    expect(data.stillListening.map((c) => c.sub)).toEqual(['Episode']);
    expect(data.sections.slice(0, 2)).toEqual(['Up next', 'Still listening']);
  });

  it('[M2.sorting] leaves both shelves out, unnamed, while the feed holds none', () => {
    const data = browseData([], noFeed, browse.placeholder);
    expect(data.upNext).toEqual([]);
    expect(data.sections).not.toContain('Up next');
    expect(data.sections).not.toContain('Still listening');
  });
});
