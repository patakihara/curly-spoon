import { createElement, type ComponentType, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createApiClient } from '../api/client';
import { pages, routes } from '../generated/nav/routes';
import { type ShellHandle, type ShellTabs } from '../generated/nav/Shell';
import Book, { frame as bookFrame } from '../generated/pages/Book';
import { frame as booksFrame } from '../generated/pages/Books';
import Music from '../generated/pages/Music';
import Queue from '../generated/pages/Queue';
import { type Access, type AccessStore } from './access';
import { PageDepsContext, type PageDeps } from './deps';
import { withPageData } from '.';
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
    load: async () => undefined,
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
