import {
  createElement,
  isValidElement,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import { type RouteObject, useMatches, useSearchParams } from 'react-router';
import { type ApiClient } from '../api/client';
import { type FrameContext, type PageFrame } from '../generated/nav/platform';
import { pages as routePages } from '../generated/nav/routes';
import { type ShellHandle, type ShellTabs } from '../generated/nav/Shell';
import Album, { frame as albumFrame } from '../generated/pages/Album';
import Artist, { frame as artistFrame } from '../generated/pages/Artist';
import Author, { frame as authorFrame } from '../generated/pages/Author';
import Book, { frame as bookFrame } from '../generated/pages/Book';
import Books, { frame as booksFrame } from '../generated/pages/Books';
import Browse, { frame as browseFrame } from '../generated/pages/Browse';
import Episode, { frame as episodeFrame } from '../generated/pages/Episode';
import Favourites, { frame as favouritesFrame } from '../generated/pages/Favourites';
import List, { frame as listFrame } from '../generated/pages/List';
import Lyrics, { type LyricsData } from '../generated/pages/Lyrics';
import Music, { frame as musicFrame } from '../generated/pages/Music';
import Playlist, { frame as playlistFrame } from '../generated/pages/Playlist';
import Podcasts, { frame as podcastsFrame } from '../generated/pages/Podcasts';
import Queue, { type QueueData } from '../generated/pages/Queue';
import Requests, { frame as requestsFrame } from '../generated/pages/Requests';
import Search, { type SearchData, frame as searchFrame } from '../generated/pages/Search';
import Series, { frame as seriesFrame } from '../generated/pages/Series';
import Settings, { frame as settingsFrame } from '../generated/pages/Settings';
import Setup, { frame as setupFrame } from '../generated/pages/Setup';
import Shelf, { frame as shelfFrame } from '../generated/pages/Shelf';
import ShelfReview, { frame as shelfReviewFrame } from '../generated/pages/ShelfReview';
import Show, { frame as showFrame } from '../generated/pages/Show';
import SignIn from '../generated/pages/SignIn';
import { usePlayId } from '../player';
import { type Draft, useTabDraft } from '../query';
import { useAccessOf } from './access';
import { useDeps } from './deps';
import { emptied } from './format';
import { albumData, bookData, episodeData, showData } from './items';
import { booksData, browseData, musicData, podcastsData } from './library';
import { emptyQueue, queueData } from './queue';
import { emptySearch, loadSearchPage, searchLive, type SearchLoaded } from './search';
import { SignInScreen } from './sign-in';
import { loadItem, loadLibraries, loadLibrary, loadQueues } from './loads';
import { answerFrom, type Answer, pageKey } from './store';

/**
 * The generated pages given their data. `withPageData(routes)` swaps each page for its screen,
 * wherever the route table draws it: a route's page, the page a player sheet is drawn over, a
 * player tab's page in the side panel, and the back layer and subheader the page's frame hands
 * the shell. One screen per page: Browse's first shelf and the library homes from
 * `GET /api/library/{medium}`, a book, show, episode or album from `GET /api/items/{ref}`, the
 * queue from `GET /api/queues/{active}`, Search from what is typed into it (`../query`) and
 * `GET /api/search/suggest` or `GET /api/search`, sign in from the address. Now Playing reads the
 * player itself. Every other page draws empty, keeping only its own words, until its milestone
 * serves it: a member never sees the canvas's samples. A page loading shows its lists empty; on a
 * server nobody can sign in to, every page keeps its canvas placeholder (`access.ts`); a request
 * refused for want of a sign-in goes to sign in.
 */

/** A page's address: its path's params and the query values its route declares. */
type Params = Readonly<Record<string, string | undefined>>;

/** What a page draws beyond its address, from it and what is typed: Search. */
interface Live<T, L> {
  /** What it loads, in place of its address; null loads nothing yet. */
  asks: Params | null;
  /** What it draws, given the answer to what it asks and what it drew last. */
  draw(answer: Answer<L>, last: Drawn<T> | null): Drawn<T>;
}

/** A page's data, and which of its states it draws. */
interface Drawn<T> {
  data: T;
  state?: string;
}

/** One page's data: what it draws while loading, and how it loads (`L`, for a live page). */
interface Screen<T, L = T> {
  name: string;
  Page: ComponentType<{ data?: T; state?: string }>;
  frame?: PageFrame<T>;
  empty: T;
  /** Whether its data changes with what the player plays. */
  followsPlayer?: boolean;
  /** How it loads; a page nothing serves yet draws `empty` and loads nothing. */
  load?(api: ApiClient, params: Params): Promise<L>;
  /**
   * For a page drawn from more than its address, the tab's search draft too: what it loads and
   * draws. Not a hook: the hooks it reads from are called for every page alike.
   */
  live?(params: Params, draft: Draft | null): Live<T, L>;
}

/** A page nothing serves yet: drawn empty, with `words`, the page's own, as the canvas has them. */
function unserved<T>(
  name: string,
  Page: ComponentType<{ data?: T }>,
  frame: PageFrame<T>,
  words: (keyof T)[] = [],
): Screen<T> {
  const kept = Object.fromEntries(words.map((word) => [word, frame.placeholder[word]]));
  return { name, Page, frame, empty: { ...emptied(frame.placeholder), ...kept } };
}

const searchEmpty = emptySearch(searchFrame.placeholder);

const screens: Screen<never>[] = [
  {
    name: 'browse',
    Page: Browse,
    frame: browseFrame,
    empty: browseData([], browseFrame.placeholder),
    load: async (api) => browseData(await loadLibraries(api), browseFrame.placeholder),
  } satisfies Screen<typeof browseFrame.placeholder>,
  {
    name: 'books',
    Page: Books,
    frame: booksFrame,
    empty: { ...booksFrame.placeholder, library: [] },
    load: async (api) => booksData(await loadLibrary(api, 'books'), booksFrame.placeholder),
  } satisfies Screen<typeof booksFrame.placeholder>,
  {
    name: 'podcasts',
    Page: Podcasts,
    frame: podcastsFrame,
    empty: { ...podcastsFrame.placeholder, library: [], lists: [] },
    load: async (api) =>
      podcastsData(await loadLibrary(api, 'podcasts'), podcastsFrame.placeholder),
  } satisfies Screen<typeof podcastsFrame.placeholder>,
  {
    name: 'music',
    Page: Music,
    frame: musicFrame,
    empty: { ...musicFrame.placeholder, library: [] },
    load: async (api) => musicData(await loadLibrary(api, 'music'), musicFrame.placeholder),
  } satisfies Screen<typeof musicFrame.placeholder>,
  {
    name: 'book',
    Page: Book,
    frame: bookFrame,
    empty: emptied(bookFrame.placeholder),
    load: async (api, params) => bookData(await loadItem(api, params.ref), bookFrame.placeholder),
  } satisfies Screen<typeof bookFrame.placeholder>,
  {
    name: 'show',
    Page: Show,
    frame: showFrame,
    empty: emptied(showFrame.placeholder),
    load: async (api, params) => showData(await loadItem(api, params.ref), showFrame.placeholder),
  } satisfies Screen<typeof showFrame.placeholder>,
  {
    name: 'episode',
    Page: Episode,
    frame: episodeFrame,
    empty: { ...emptied(episodeFrame.placeholder), kind: episodeFrame.placeholder.kind },
    load: async (api, params) =>
      episodeData(await loadItem(api, params.ref), episodeFrame.placeholder),
  } satisfies Screen<typeof episodeFrame.placeholder>,
  {
    name: 'album',
    Page: Album,
    frame: albumFrame,
    empty: emptied(albumFrame.placeholder),
    load: async (api, params) => albumData(await loadItem(api, params.ref), albumFrame.placeholder),
  } satisfies Screen<typeof albumFrame.placeholder>,
  {
    name: 'queue',
    Page: Queue,
    empty: emptyQueue('music'),
    followsPlayer: true,
    load: async (api) => {
      const queues = await loadQueues(api);
      return queues === null ? emptyQueue('music') : queueData(queues.active, queues.then);
    },
  } satisfies Screen<QueueData>,
  {
    name: 'lyrics',
    Page: Lyrics,
    empty: { lines: [], activeIndex: 0, syncMode: 'dot' },
  } satisfies Screen<LyricsData>,
  {
    name: 'search',
    Page: Search,
    frame: searchFrame,
    empty: searchEmpty,
    live: (params, draft) => {
      const q = params.q ?? '';
      return searchLive(q, draft?.over === q ? draft : null, searchEmpty);
    },
    load: (api, asks) => loadSearchPage(api, asks, searchEmpty),
  } satisfies Screen<SearchData, SearchLoaded>,
  unserved('settings', Settings, settingsFrame),
  unserved('setup', Setup, setupFrame, ['intro', 'codeHint']),
  unserved('requests', Requests, requestsFrame),
  unserved('shelf', Shelf, shelfFrame),
  unserved('shelfReview', ShelfReview, shelfReviewFrame),
  unserved('artist', Artist, artistFrame, ['kind']),
  unserved('playlist', Playlist, playlistFrame, ['kind']),
  unserved('favourites', Favourites, favouritesFrame),
  unserved('author', Author, authorFrame, ['kind']),
  unserved('series', Series, seriesFrame, ['kind']),
  unserved('list', List, listFrame, ['kind']),
] as Screen<never>[];

/** The page's address: its path's params, and the query values its route declares. */
function useParams(): Params {
  const match = useMatches().at(-1);
  const [search] = useSearchParams();
  const names = routePages.find((page) => page.id === match?.id)?.query ?? [];
  return {
    ...match?.params,
    ...Object.fromEntries(names.map((name) => [name, search.get(name) ?? undefined])),
  };
}

/**
 * The data `screen` shows here, and its state: undefined on the canvas, which draws the page's
 * placeholder.
 */
function useScreenData<T, L>(screen: Screen<T, L>): Drawn<T> | undefined {
  const { api, access, pages } = useDeps();
  const who = useAccessOf(access);
  const params = useParams();
  // The same hooks on every draw, whichever screen: the shell's back layer keeps one FramePart
  // from page to page, handing it each page's screen in turn.
  const draft = useTabDraft(screen.live !== undefined);
  const live = screen.live?.(params, draft);
  const asks = live === undefined ? params : live.asks;
  const playId = usePlayId();
  const key = asks === null ? null : pageKey(screen.name, asks, screen.followsPlayer ? playId : '');
  const kept = useSyncExternalStore(
    pages.subscribe,
    () => (key === null ? undefined : pages.peek(key)),
    () => (key === null ? undefined : pages.peek(key)),
  );
  const failed = useSyncExternalStore(
    pages.subscribe,
    () => key !== null && pages.failed(key),
    () => key !== null && pages.failed(key),
  );
  const last = useRef<{ screen: string; drawn: Drawn<T> } | null>(null);
  useEffect(() => {
    const load = screen.load;
    if (who === 'member' && load !== undefined && key !== null && asks !== null) {
      void pages.load(key, () => load(api, asks));
    } else if (who === 'signedOut') access.signIn();
    // `asks` is in `key`.
  }, [who, key, screen, api, pages, access]);
  if (who === 'canvas') return undefined;
  if (live === undefined) return { data: (kept as T | undefined) ?? screen.empty };
  const drawn = live.draw(
    answerFrom(kept as L | undefined, failed),
    last.current?.screen === screen.name ? last.current.drawn : null,
  );
  last.current = { screen: screen.name, drawn };
  return drawn;
}

const made = new Map<Screen<never>, ComponentType>();

/** The page `screen` draws, given its data. */
function pageOf<T>(screen: Screen<T>): ComponentType {
  const key = screen as unknown as Screen<never>;
  let component = made.get(key);
  if (component === undefined) {
    const Page = screen.Page;
    component = function ScreenPage() {
      const shown = useScreenData(screen);
      return <Page data={shown?.data} state={shown?.state} />;
    };
    made.set(key, component);
  }
  return component;
}

/** A frame's part drawn with the screen's data, or its placeholder on the canvas. */
function FramePart<T>(props: {
  screen: Screen<T>;
  frame: PageFrame<T>;
  part: 'back' | 'subheader';
  context: FrameContext;
}): ReactNode {
  const data = useScreenData(props.screen)?.data ?? props.frame.placeholder;
  return props.part === 'back'
    ? props.frame.back(data, props.context)
    : props.frame.subheader?.(data, props.context);
}

const frames = new Map<PageFrame<unknown>, PageFrame<unknown>>();

/** `frame` with its back layer and subheader drawn from the screen's data. */
function frameOf<T>(screen: Screen<T>, frame: PageFrame<T>): PageFrame<T> {
  const key = frame as PageFrame<unknown>;
  let bound = frames.get(key) as PageFrame<T> | undefined;
  if (bound === undefined) {
    const part = (name: 'back' | 'subheader') => (_data: T, context: FrameContext) =>
      createElement(FramePart<T>, { screen, frame, part: name, context });
    bound = {
      ...frame,
      back: part('back'),
      ...(frame.subheader === undefined ? {} : { subheader: part('subheader') }),
    };
    frames.set(key, bound as PageFrame<unknown>);
  }
  return bound;
}

const byPage = new Map<unknown, Screen<never>>(screens.map((s) => [s.Page, s]));
const byFrame = new Map<unknown, Screen<never>>(
  screens.filter((s) => s.frame !== undefined).map((s) => [s.frame, s]),
);

/** A page component as its screen, where it has one. */
const screenOf = (Page: ComponentType): ComponentType => {
  if (Page === SignIn) return SignInScreen;
  const screen = byPage.get(Page);
  return screen === undefined ? Page : pageOf(screen);
};

const boundFrame = (frame: PageFrame<unknown>): PageFrame<unknown> => {
  const screen = byFrame.get(frame);
  return screen === undefined
    ? frame
    : (frameOf(screen, frame as PageFrame<never>) as PageFrame<unknown>);
};

const boundElement = (element: ReactNode): ReactNode => {
  if (!isValidElement(element) || typeof element.type === 'string') return element;
  const Screen = screenOf(element.type as ComponentType);
  return Screen === element.type ? element : createElement(Screen);
};

const boundHandle = (handle: unknown): unknown => {
  if (handle === null || typeof handle !== 'object') return handle;
  const { frame, over } = handle as ShellHandle;
  const tabs = (handle as Partial<ShellTabs>).tabs;
  return {
    ...handle,
    ...(frame === undefined ? {} : { frame: boundFrame(frame) }),
    ...(over === undefined
      ? {}
      : { over: { frame: boundFrame(over.frame), Page: screenOf(over.Page) } }),
    ...(tabs === undefined
      ? {}
      : {
          tabs: Object.fromEntries(
            Object.entries(tabs).map(([key, Page]) => [key, screenOf(Page)]),
          ),
        }),
  };
};

const bind = (route: RouteObject): RouteObject =>
  ({
    ...route,
    element: boundElement(route.element) as ReactElement | null | undefined,
    handle: boundHandle(route.handle),
    ...(route.children === undefined ? {} : { children: route.children.map(bind) }),
  }) as RouteObject;

/** The generated routes, every page with data drawn as its screen. */
export function withPageData(routes: RouteObject[]): RouteObject[] {
  return routes.map(bind);
}
