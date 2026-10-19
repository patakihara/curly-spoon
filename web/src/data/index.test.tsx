import { createElement, type ComponentType, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../api/client';
import { pages, routes } from '../generated/nav/routes';
import { type ShellHandle, type ShellTabs } from '../generated/nav/Shell';
import Book, { frame as bookFrame } from '../generated/pages/Book';
import { frame as booksFrame } from '../generated/pages/Books';
import { frame as listFrame } from '../generated/pages/List';
import { frame as podcastsFrame } from '../generated/pages/Podcasts';
import Music from '../generated/pages/Music';
import Queue from '../generated/pages/Queue';
import { frame as searchFrame } from '../generated/pages/Search';
import { drafts, SETTLE_MS } from '../query';
import { type Access, type AccessStore } from './access';
import { PageDepsContext, type PageDeps } from './deps';
import { withPageData } from '.';
import { emptySearch } from './search';
import { type PageStore } from './store';

/** What the pages read, with `who` the app is drawn for and each page's kept data by its name. */
function deps(who: Access, kept: Record<string, unknown> = {}) {
  const sent: string[] = [];
  const access: AccessStore = {
    subscribe: () => () => undefined,
    getState: () => who,
    refused: () => undefined,
    signIn: () => void sent.push('sign in'),
  };
  const pages: PageStore = {
    subscribe: () => () => undefined,
    peek: (key) => kept[/^[a-z]+/.exec(key)![0]],
    failed: () => false,
    load: async () => undefined,
    retry: async () => undefined,
  };
  const given: PageDeps = {
    api: createApiClient({ fetch: () => Promise.reject(new Error('no network in unit tests')) }),
    access,
    pages,
  };
  return { given, sent };
}

/** The app at `url`, its pages given their data, as the router draws it there. */
function renderAt(url: string, given: PageDeps) {
  const router = createMemoryRouter(withPageData(routes), { initialEntries: [url] });
  return renderToString(
    createElement(
      PageDepsContext.Provider,
      { value: given },
      createElement(RouterProvider, { router }),
    ),
  );
}

const books = {
  ...booksFrame.placeholder,
  library: [
    {
      title: 'Three Poems',
      ref: 'abs:b1',
      sub: 'A Poet',
      image: '',
      progress: null,
      status: null,
      tone: null,
    },
  ],
};

/** The canvas's sample books, and its player's sample track. */
const SAMPLE_BOOK = booksFrame.placeholder.library[1]!.title;
const SAMPLE_TRACK = 'Heartbeats in Silence';

/** A sample from each page's canvas placeholder, and from its player's. */
const SAMPLES = [
  SAMPLE_BOOK,
  SAMPLE_TRACK,
  'The Quiet Lodger', // Browse
  'Salt in the Ledger', // Browse's feature, Episode's more
  'The Night Ferry', // Episode
  'Salt and Static', // Search, Requests, Shelf
  'Deep Inertia', // Artist, Shelf
  'Late walks', // Playlist
  'Evelyn Harper', // Author, Series
  'The Harbour Quartet', // Series
  'Auto-download requests', // Settings
  'media.example.org', // Settings
  'books.example.org', // Setup
  'Prowlarr', // Setup
  'Morning', // List
  'Heartbeats in silence, counting down the hall', // Lyrics
];

describe('[M1.shell] the pages given their data', () => {
  it('lists a member’s own books, with no player while nothing is loaded', () => {
    const html = renderAt('/books', deps('member', { books }).given);
    expect(html).toContain('Three Poems');
    expect(html).not.toContain(SAMPLE_BOOK);
    expect(html).not.toContain(SAMPLE_TRACK);
  });

  it('shows the page’s lists empty while its data loads, never the canvas’s samples', () => {
    for (const who of ['unknown', 'member'] as const) {
      const html = renderAt('/books', deps(who).given);
      expect(html, who).not.toContain(SAMPLE_BOOK);
      expect(html, who).toContain('Books');
    }
  });

  it('keeps the canvas’s placeholders, pages and player alike, on a server nobody can sign in to', () => {
    const html = renderAt('/books', deps('canvas', { books }).given);
    expect(html).toContain(SAMPLE_BOOK);
    expect(html).not.toContain('Three Poems');
    expect(html).toContain(SAMPLE_TRACK);
  });

  it('names the open book in the back layer the shell draws, from the page’s own data', () => {
    const book = { ...bookFrame.placeholder, title: 'The Salt Road', ref: 'abs:b1' };
    const html = renderAt('/books/abs:b1', deps('member', { book }).given);
    expect(html.split('The Salt Road').length - 1).toBeGreaterThanOrEqual(2);
    expect(html).not.toContain(bookFrame.placeholder.title);
  });

  it('draws every page empty for a member, with none of the canvas’s samples, until it is served', () => {
    for (const page of pages) {
      if (page.id === 'signIn') continue;
      const url = page.path.replace(':ref', 'abs:x').replace(':id', 'x').replace('*', '/nowhere');
      const html = renderAt(url, deps('member').given);
      for (const sample of SAMPLES) expect(html, `${page.id}: ${sample}`).not.toContain(sample);
    }
  });

  it('draws sign in from its address, as before', () => {
    const html = renderAt('/sign-in?error=not_household', deps('signedOut').given);
    expect(html).toMatch(/one of the household/);
  });
});

describe('[M2.lists] the list pages given their data', () => {
  const commute = {
    ...listFrame.placeholder,
    title: 'Commute',
    ref: 'l1',
    kind: 'Playlist',
    meta: '1 episode',
    menu: [],
    shows: [],
    order: '',
    items: [
      {
        title: 'Part One',
        ref: 'abs:ep-1',
        description: '',
        meta: ['Megacorp'],
        image: '',
        progress: null,
      },
    ],
  };

  it("[M2.lists] draws a list's page from its data, its Play live and its Play next left out", () => {
    const html = renderAt('/lists/l1', deps('member', { list: commute }).given);
    expect(html).toContain('Commute');
    expect(html).toContain('Part One');
    expect(html).not.toContain(listFrame.placeholder.title);
    // Each button's opening tag, by the words it ends on.
    const button = (label: string) =>
      html
        .split('<button')
        .map((part) => part.slice(0, part.indexOf('</button>')))
        .find((part) => part.replace(/<[^>]*>/g, '').endsWith(label))
        ?.split('>')[0] ?? '';
    expect(button('Play')).not.toBe('');
    expect(button('Play')).not.toContain('disabled');
    expect(button('Play next')).toContain('disabled');
  });

  it('[M2.lists] lists your lists on the Podcasts page after your shows', () => {
    const podcasts = {
      ...podcastsFrame.placeholder,
      library: [],
      lists: [{ title: 'Night drives', ref: 'l1', sub: 'Playlist · 1 episode', covers: [] }],
    };
    const html = renderAt('/podcasts', deps('member', { podcasts }).given);
    expect(html).toContain('Night drives');
    expect(html).toContain('Playlist · 1 episode');
    expect(html).not.toContain(podcastsFrame.placeholder.lists[1]!.title);
  });
});

describe('[M1.shell] the route table given its data', () => {
  const given = withPageData(routes);
  const shell = given[0]!;
  const children = (r: RouteObject) => r.children ?? [];
  const all = (r: RouteObject[]): RouteObject[] => r.flatMap((x) => [x, ...all(children(x))]);
  const typeOf = (r: RouteObject | undefined) => (r?.element as ReactElement | undefined)?.type;
  const find = (table: RouteObject[], id: string) => all(table).find((r) => r.id === id);

  it('keeps every route where it was', () => {
    expect(all(given).map((r) => [r.id, r.path])).toEqual(all(routes).map((r) => [r.id, r.path]));
  });

  it('draws every page with data as its screen; Now Playing and Not found, which have none, as generated', () => {
    for (const page of pages) {
      const generated = typeOf(find(routes, page.id));
      const drawn = typeOf(find(given, page.id));
      if (page.id === 'nowPlaying' || page.id === 'notFound')
        expect(drawn, page.id).toBe(generated);
      else expect(drawn, page.id).not.toBe(generated);
    }
    expect(typeOf(find(given, 'book'))).not.toBe(Book);
    expect(typeOf(find(given, 'queue'))).not.toBe(Queue);
  });

  it('gives the page under a player sheet, and the side panel’s queue, their data too', () => {
    const over = (find(given, 'queue')?.handle as ShellHandle).over!;
    expect(over.Page).not.toBe(Music);
    const tabs = (shell.handle as ShellTabs).tabs;
    expect(tabs.queue).not.toBe(Queue);
    expect(tabs.queue).toBe(typeOf(find(given, 'queue')) as ComponentType);
    const original = (routes[0]!.handle as ShellTabs).tabs;
    expect(tabs.now).toBe(original.now);
  });

  it('draws a page’s back layer from its data, and leaves a frame with no data as it was', () => {
    const frameOf = (table: RouteObject[], id: string) =>
      (find(table, id)?.handle as ShellHandle).frame!;
    expect(frameOf(given, 'book')).not.toBe(bookFrame);
    expect(frameOf(given, 'book').chrome).toBe(bookFrame.chrome);
    expect(frameOf(given, 'notFound')).toBe(frameOf(routes, 'notFound'));
  });
});

describe('search given its data', () => {
  afterEach(() => {
    drafts.clear();
    vi.useRealTimers();
  });

  const row = (title: string) => ({
    title,
    meta: 'Album',
    image: '',
    page: 'album',
    ref: 'jellyfin:a1',
    playRef: 'jellyfin:a1',
    queue: 'music',
  });
  const empty = emptySearch(searchFrame.placeholder);
  const results = {
    data: { ...empty, top: row('The Rise and Fall'), library: [row('Rumours')] },
    found: true,
  };
  const suggesting = (...titles: string[]) => ({
    data: {
      ...empty,
      suggestions: titles.map((title) => ({ title, meta: 'Album', query: title, icon: 'search' })),
    },
    found: true,
  });

  /** A member's pages, Search's answers kept by what was asked for. */
  function member(answers: Record<string, unknown>): PageDeps {
    const { given } = deps('member');
    return {
      ...given,
      pages: {
        ...given.pages,
        peek: (key) => (key.startsWith('search') ? answers[key.slice('search'.length)] : undefined),
      },
    };
  }
  const asked = (asks: object) => JSON.stringify(asks);

  it('shows the results of the search in its address, and no suggestions', () => {
    const html = renderAt('/search?q=ri', member({ [asked({ q: 'ri' })]: results }));
    expect(html).toContain('The Rise and Fall');
    expect(html).toContain('Rumours');
    expect(html).toContain('Top result');
    expect(html).toContain('value="ri"');
  });

  it('says, in the page’s own words, that nothing was found, or that the search failed', () => {
    const none = renderAt(
      '/search?q=zz',
      member({ [asked({ q: 'zz' })]: { ...results, found: false } }),
    );
    expect(none).toContain('Nothing found');
    expect(none).not.toContain('Search failed');
    const { given } = deps('member');
    const failing: PageDeps = { ...given, pages: { ...given.pages, failed: () => true } };
    const failed = renderAt('/search?q=zz', failing);
    expect(failed).toContain('Search failed');
    expect(failed).toContain('The server did not answer this search.');
    expect(failed).not.toContain('Nothing found');
  });

  it('shows recent searches when opened with nothing typed', () => {
    const html = renderAt('/search', member({ [asked({ suggest: '' })]: suggesting('rise') }));
    expect(html).toContain('rise');
    expect(html).not.toContain('Top result');
  });

  it('holds the draft in the field as typed, over the search it was typed on', () => {
    vi.useFakeTimers();
    drafts.type('rix', 'ri');
    const html = renderAt('/search?q=ri', member({ [asked({ q: 'ri' })]: results }));
    expect(html).toContain('value="rix"');
    expect(html).not.toContain('Top result');
    expect(html).not.toContain('Rumours');
  });

  it('draws the suggestions for what has settled, whichever answer came last', () => {
    vi.useFakeTimers();
    drafts.type('r', '');
    vi.advanceTimersByTime(SETTLE_MS);
    drafts.type('ri', '');
    vi.advanceTimersByTime(SETTLE_MS);
    const answers = {
      [asked({ suggest: 'ri' })]: suggesting('The Rise and Fall'),
      [asked({ suggest: 'r' })]: suggesting('Rumours'),
    };
    const html = renderAt('/search', member(answers));
    expect(html).toContain('The Rise and Fall');
    expect(html).not.toContain('Rumours');
  });

  it('leaves a draft behind when another search opens, as a suggestion does', () => {
    drafts.type('rix', 'ri');
    const html = renderAt('/search?q=Rumours', member({ [asked({ q: 'Rumours' })]: results }));
    expect(html).toContain('value="Rumours"');
    expect(html).toContain('Top result');
  });
});
