import { type LibraryEntry, LibraryList } from '@auralis/schema';
import { describe, expect, it } from 'vitest';
import { frame as books } from '../generated/pages/Books';
import { frame as browse } from '../generated/pages/Browse';
import { frame as music } from '../generated/pages/Music';
import { frame as podcasts } from '../generated/pages/Podcasts';
import { booksData, browseData, musicData, podcastsData, statusOf } from './library';

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

const list = (...items: LibraryEntry[]) => LibraryList.parse({ items });

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
    expect(data.sort).toEqual(books.placeholder.sort);
  });

  it('draws a card with no art and no author without a broken image or a stray word', () => {
    const [card] = booksData(list(entry({ art: null, sub: null })), books.placeholder).library;
    expect(card!.image).toBe('');
    expect(card!.sub).toBe('');
  });

  it('lists each show by its host, with no lists while none are served', () => {
    const show = entry({
      ref: { source: 'abs', id: 's1' },
      kind: 'show',
      title: 'Megacorp',
      art: '/api/media/abs:s1/art',
    });
    const data = podcastsData(list(show), podcasts.placeholder);
    expect(data.library).toEqual([
      {
        title: 'Megacorp',
        ref: 'abs:s1',
        sub: 'Rosa Elin',
        image: '/api/media/abs:s1/art?size=medium',
        unplayed: false,
      },
    ]);
    expect(data.lists).toEqual([]);
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

  it('shows nothing else, none of the canvas’s samples, and names only its one shelf', () => {
    expect(data.sections).toEqual([browse.placeholder.sections[0]]);
    expect(data.recentlyAdded).toEqual([]);
    expect(data.people).toEqual([]);
    expect(data.pickedForYou).toEqual([]);
    expect(data.recentlyPlayed).toEqual([]);
    expect(data.feature.title).toBe('');
    expect(data.shelves.recentlyAdded).toBe('');
  });
});
