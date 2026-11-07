import {
  createElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  generatePath,
  type RouteObject,
  useMatches,
  useNavigate,
  useSearchParams,
} from 'react-router';
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
import { type Act, ActContext } from '../act';
import { type Request, RequestContext, requestOf } from '../request';
import { type Choose, ChooseContext } from '../choose';
import {
  PlayContext,
  type PlayerHeard,
  playerStore,
  useListPlay,
  usePlayerHeard,
  usePlayId,
} from '../player';
import { type Draft, useTabDraft } from '../query';
import { RetryContext } from '../retry';
import { type RequestList, type RequestVerb } from '@auralis/schema';
import { type Toggle, ToggleContext, type ToggleSetting } from '../toggle';
import { useAccessOf } from './access';
import { useDeps } from './deps';
import { emptied } from './format';
import { albumData, bookData, episodeData, showAwaited, showData } from './items';
import {
  booksData,
  browseData,
  homeState,
  libraryAwaited,
  musicData,
  podcastsData,
} from './library';
import { emptyQueue, queueData } from './queue';
import {
  makeRequest,
  TOO_MANY_REQUESTS,
  TooManyRequests,
  requestsData,
  requestsMoving,
  requestsState,
  requestVerb,
  verbFailure,
} from './requests';
import {
  emptySearch,
  loadSearchPage,
  searchLive,
  type SearchLoaded,
  searchHeard,
  searchRequestFailed,
} from './search';
import { setSetting, settingFailure, settingsData, settingsAwaited } from './settings';
import { SignInScreen } from './sign-in';
import { listCards, listData } from './lists';
import {
  episodeAsk,
  feedOrNone,
  libraryAsk,
  listsOrNone,
  loadItem,
  loadLibraries,
  loadLibrary,
  loadList,
  loadPodcasts,
  loadQueues,
  loadRequests,
  loadSettings,
  settledAddress,
} from './loads';
import { addMenu, browserAsk, itemVerb, listVerb } from './menus';
import { answerFrom, type Answer, pageKey, SignedOut } from './store';

/**
 * The generated pages given their data. `withPageData(routes)` swaps each page for its screen,
 * wherever the route table draws it: a route's page, the page a player sheet is drawn over, a
 * player tab's page in the side panel, and the back layer and subheader the page's frame hands
 * the shell. One screen per page: Browse's first shelf and the library homes from
 * `GET /api/library/{medium}`, in the order their address asks, which their sort menu replaces,
 * Browse's Up next and Still listening from `GET /api/feed`, Podcasts' lists from
 * `GET /api/lists`, a book, show, episode or album from `GET /api/items/{ref}`, a show's episodes
 * in the order its address asks, which its sort menu replaces, a list from
 * `GET /api/lists/{id}`, whose Play plays it through its own route (`listPlayOf`) and whose menu
 * renames, turns round or deletes it, a book's, show's or episode's menu adding it to your lists
 * (`./menus`), the queue from `GET /api/queues/{active}`, Search from what is typed into it
 * (`../query`) and `GET /api/search/suggest` or `GET /api/search`, whose book rows ask through
 * `POST /api/requests` and look again while one moves, sign in from the address,
 * Requests from `GET /api/requests`, looking again after each verb and while anything moves, and
 * Settings' switch for everyone's library from `GET /api/settings`, setting it through
 * `PUT /api/settings`. A library home with nothing of yours draws its empty state, and it or
 * Requests draws its failed state when its list failed to load, with a way to ask again. Now Playing
 * reads the player itself. Every other page draws empty, keeping only its own words,
 * until its milestone serves it: a member never sees the canvas's samples. A page loading shows
 * its lists empty, a library home's or show's sort bar naming the sort its address asks; on a server nobody
 * can sign in to, every page keeps its canvas placeholder (`access.ts`); a request refused for
 * want of a sign-in goes to sign in.
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
  /** Whether the server has answered what it draws, so the data is more than what it awaited. */
  answered?: boolean;
}

/** One page's data: what it draws while loading, and how it loads (`L`, for a live page). */
interface Screen<T, L = T> {
  name: string;
  Page: ComponentType<{ data?: T; state?: string }>;
  frame?: PageFrame<T>;
  /** What it draws while it loads, or when its request fails, at its address. */
  empty(params: Params): T;
  /** Whether its data changes with what the player plays. */
  followsPlayer?: boolean;
  /** For a list's page, the list its Play plays, by its address. */
  playsList?(params: Params): string;
  /**
   * For a page whose menu acts on its item, verb `key` done to the item `ref` names: the page to
   * open after, or whether to load this one again.
   */
  verbs?(
    api: ApiClient,
    ref: string,
    key: string,
  ): Promise<{ open?: string; replace?: boolean; reload?: boolean }>;
  /** For a page that says it is empty, which of its states what it loaded draws. */
  stateOf?(loaded: L): string;
  /** For a page with a `failed` state: it draws that when its first load failed. */
  saysFailed?: boolean;
  /** For a page whose data moves by itself, whether what it loaded should be looked at again. */
  polls?(loaded: L): boolean;
  /** For a page of requests, a request's verb: the page loads again after it. */
  acts?(api: ApiClient, ref: string, verb: RequestVerb, candidate?: string): Promise<void>;
  /** What the page says when a request's verb fails. */
  actFailure?(verb: RequestVerb): string;
  /** What the page draws by what the player says. */
  heard?(data: T, heard: PlayerHeard): T;
  /** What the page draws when a tap on the ref `failed` did not make its request. */
  requestFailed?(data: T, failed: string): T;
  /** For a page of switches, a setting set to what its switch says: the page loads again after. */
  toggles?(api: ApiClient, setting: ToggleSetting, next: boolean): Promise<void>;
  /** What the page says when a switch could not be set. */
  toggleFailure?(setting: ToggleSetting): string;
  /** How it loads; a page nothing serves yet draws `empty` and loads nothing. */
  load?(api: ApiClient, params: Params): Promise<L>;
  /**
   * For a page loaded with more than it draws (a library home, with the seed its shuffle
   * answered): what it draws, and the query values its address settles on, null to leave it.
   */
  settle?(params: Params, loaded: L): { data: T; address: Params | null };
  /**
   * For a page drawn from more than its address, the tab's search draft too: what it loads and
   * draws. Not a hook: the hooks it reads from are called for every page alike.
   */
  live?(params: Params, draft: Draft | null): Live<T, L>;
}

/** An `empty` the same at every address. */
const fixed =
  <T,>(empty: T) =>
  (): T =>
    empty;

/** A page nothing serves yet: drawn empty, with `words`, the page's own, as the canvas has them. */
function unserved<T>(
  name: string,
  Page: ComponentType<{ data?: T }>,
  frame: PageFrame<T>,
  words: (keyof T)[] = [],
): Screen<T> {
  const kept = Object.fromEntries(words.map((word) => [word, frame.placeholder[word]]));
  return { name, Page, frame, empty: fixed({ ...emptied(frame.placeholder), ...kept }) };
}

const searchEmpty = emptySearch(searchFrame.placeholder);
const requestsEmpty = emptied(requestsFrame.placeholder);

/** How often a page whose data moves by itself looks again. */
const POLL_MS = 5_000;

/** A library home's page, and the seed its shuffle answered, null unless random. */
interface Ordered<T> {
  data: T;
  seed: number | null;
}

/** A library home's answer: its page, its address settling on the seed the server drew. */
const settleOrder = <T,>(params: Params, loaded: Ordered<T>) => ({
  data: loaded.data,
  address: settledAddress(params, loaded.seed),
});

const pathOf = (id: string) => routePages.find((page) => page.id === id)!.path;
const listPath = pathOf('list');
const podcastsPath = pathOf('podcasts');
const showPath = pathOf('show');

/** A seed for a fresh shuffle: any unsigned 32-bit whole number. */
const freshSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]!;

/**
 * A library home's sort menu: the chosen sort replaces the page's address, which loads the list in
 * that order. Random draws a fresh seed each time it is chosen, even while already shuffled, which
 * is the reshuffle; the seed in the address keeps that order through a reload or going back. An
 * address asking for random without a seed settles on the one the server drew (`settleOrder`).
 */
const sortVerbs = (path: string) => async (_api: ApiClient, _ref: string, key: string) => {
  const query: Record<string, string> =
    key === 'random' ? { sort: key, seed: String(freshSeed()) } : { sort: key };
  return { open: `${path}?${new URLSearchParams(query)}`, replace: true };
};

/** An item's verbs: adding it to a list, opening a new list made with it. */
const itemVerbs = async (api: ApiClient, ref: string, key: string) => {
  const made = await itemVerb(api, browserAsk, ref, key);
  return made === null ? {} : { open: generatePath(listPath, { ref: made }) };
};

/**
 * A show's verbs: its sort menu's order replaces the page's address, which loads its episodes in
 * that order; any other key is its menu's, an item's verb.
 */
const showVerbs = async (api: ApiClient, ref: string, key: string) => {
  const sort = episodeAsk({ sort: key }).sort;
  if (sort === undefined) return itemVerbs(api, ref, key);
  return {
    open: `${generatePath(showPath, { ref })}?${new URLSearchParams({ sort })}`,
    replace: true,
  };
};

const screens: Screen<never>[] = [
  {
    name: 'browse',
    Page: Browse,
    frame: browseFrame,
    empty: fixed(browseData([], { shelves: [] }, browseFrame.placeholder)),
    load: async (api) => {
      const [lists, feed] = await Promise.all([loadLibraries(api), feedOrNone(api)]);
      return browseData(lists, feed, browseFrame.placeholder);
    },
  } satisfies Screen<typeof browseFrame.placeholder>,
  {
    name: 'books',
    Page: Books,
    frame: booksFrame,
    empty: (params) => libraryAwaited(booksFrame.placeholder, libraryAsk(params).sort),
    load: async (api, params) => {
      const list = await loadLibrary(api, 'books', libraryAsk(params));
      return { data: booksData(list, booksFrame.placeholder), seed: list.seed };
    },
    settle: settleOrder,
    stateOf: ({ data }) => homeState(data.library),
    saysFailed: true,
    verbs: sortVerbs(pathOf('books')),
  } satisfies Screen<typeof booksFrame.placeholder, Ordered<typeof booksFrame.placeholder>>,
  {
    name: 'podcasts',
    Page: Podcasts,
    frame: podcastsFrame,
    empty: (params) => ({
      ...libraryAwaited(podcastsFrame.placeholder, libraryAsk(params).sort),
      lists: [],
    }),
    load: async (api, params) => {
      const { library, lists } = await loadPodcasts(api, libraryAsk(params));
      const data = podcastsData(
        library,
        lists === null ? null : listCards(lists),
        podcastsFrame.placeholder,
      );
      // The Digest is always there, so only a list holding something keeps the home from empty.
      const holding = (lists ?? []).some((list) => list.count > 0);
      return { data, seed: library.seed, holding };
    },
    settle: settleOrder,
    stateOf: ({ data, holding }) => (holding ? 'full' : homeState(data.library)),
    saysFailed: true,
    verbs: sortVerbs(podcastsPath),
  } satisfies Screen<
    typeof podcastsFrame.placeholder,
    Ordered<typeof podcastsFrame.placeholder> & { holding: boolean }
  >,
  {
    name: 'music',
    Page: Music,
    frame: musicFrame,
    empty: (params) => libraryAwaited(musicFrame.placeholder, libraryAsk(params).sort),
    load: async (api, params) => {
      const list = await loadLibrary(api, 'music', libraryAsk(params));
      return { data: musicData(list, musicFrame.placeholder), seed: list.seed };
    },
    settle: settleOrder,
    stateOf: ({ data }) => homeState(data.library),
    saysFailed: true,
    verbs: sortVerbs(pathOf('music')),
  } satisfies Screen<typeof musicFrame.placeholder, Ordered<typeof musicFrame.placeholder>>,
  {
    name: 'book',
    Page: Book,
    frame: bookFrame,
    empty: fixed(emptied(bookFrame.placeholder)),
    load: async (api, params) => {
      const [item, lists] = await Promise.all([loadItem(api, params.ref), listsOrNone(api)]);
      return { ...bookData(item, bookFrame.placeholder), menu: addMenu(lists, ['listening']) };
    },
    verbs: itemVerbs,
  } satisfies Screen<typeof bookFrame.placeholder>,
  {
    name: 'show',
    Page: Show,
    frame: showFrame,
    empty: (params) => showAwaited(showFrame.placeholder, episodeAsk(params).sort),
    load: async (api, params) => {
      const [item, lists] = await Promise.all([
        loadItem(api, params.ref, episodeAsk(params)),
        listsOrNone(api),
      ]);
      return {
        ...showData(item, showFrame.placeholder),
        menu: addMenu(lists, ['digest', 'listening']),
      };
    },
    verbs: showVerbs,
  } satisfies Screen<typeof showFrame.placeholder>,
  {
    name: 'episode',
    Page: Episode,
    frame: episodeFrame,
    empty: fixed({ ...emptied(episodeFrame.placeholder), kind: episodeFrame.placeholder.kind }),
    load: async (api, params) => {
      const [item, lists] = await Promise.all([loadItem(api, params.ref), listsOrNone(api)]);
      return { ...episodeData(item, episodeFrame.placeholder), menu: addMenu(lists, ['playlist']) };
    },
    verbs: itemVerbs,
  } satisfies Screen<typeof episodeFrame.placeholder>,
  {
    name: 'album',
    Page: Album,
    frame: albumFrame,
    empty: fixed(emptied(albumFrame.placeholder)),
    load: async (api, params) => albumData(await loadItem(api, params.ref), albumFrame.placeholder),
  } satisfies Screen<typeof albumFrame.placeholder>,
  {
    name: 'queue',
    Page: Queue,
    empty: fixed(emptyQueue('music')),
    followsPlayer: true,
    load: async (api) => {
      const queues = await loadQueues(api);
      return queues === null ? emptyQueue('music') : queueData(queues.active, queues.then);
    },
  } satisfies Screen<QueueData>,
  {
    name: 'lyrics',
    Page: Lyrics,
    empty: fixed({ lines: [], activeIndex: 0, syncMode: 'dot' }),
  } satisfies Screen<LyricsData>,
  {
    name: 'search',
    Page: Search,
    frame: searchFrame,
    empty: fixed(searchEmpty),
    live: (params, draft) => {
      const q = params.q ?? '';
      return searchLive(q, draft?.over === q ? draft : null, searchEmpty);
    },
    load: (api, asks) => loadSearchPage(api, asks, searchEmpty),
    polls: ({ moving }) => moving,
    requestFailed: searchRequestFailed,
    heard: searchHeard,
  } satisfies Screen<SearchData, SearchLoaded>,
  {
    name: 'settings',
    Page: Settings,
    frame: settingsFrame,
    empty: fixed(settingsAwaited(settingsFrame.placeholder)),
    load: async (api) => settingsData(await loadSettings(api), settingsFrame.placeholder),
    toggles: setSetting,
    toggleFailure: settingFailure,
  } satisfies Screen<typeof settingsFrame.placeholder>,
  unserved('setup', Setup, setupFrame, ['intro', 'codeHint']),
  {
    name: 'requests',
    Page: Requests,
    frame: requestsFrame,
    empty: fixed(requestsEmpty),
    load: loadRequests,
    settle: (_params, list) => ({ data: requestsData(list, requestsEmpty), address: null }),
    stateOf: requestsState,
    saysFailed: true,
    polls: requestsMoving,
    acts: requestVerb,
    actFailure: verbFailure,
  } satisfies Screen<typeof requestsFrame.placeholder, RequestList>,
  unserved('shelf', Shelf, shelfFrame),
  unserved('shelfReview', ShelfReview, shelfReviewFrame),
  unserved('artist', Artist, artistFrame, ['kind']),
  unserved('playlist', Playlist, playlistFrame, ['kind']),
  unserved('favourites', Favourites, favouritesFrame),
  unserved('author', Author, authorFrame, ['kind']),
  unserved('series', Series, seriesFrame, ['kind']),
  {
    name: 'list',
    Page: List,
    frame: listFrame,
    empty: fixed(emptied(listFrame.placeholder)),
    playsList: (params) => params.ref ?? '',
    load: async (api, params) => listData(await loadList(api, params.ref), listFrame.placeholder),
    verbs: async (api, ref, key) => {
      const done = await listVerb(api, browserAsk, ref, key);
      return done === 'gone'
        ? { open: podcastsPath, replace: true }
        : { reload: done === 'changed' };
    },
  } satisfies Screen<typeof listFrame.placeholder>,
] as unknown as Screen<never>[];

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
 * placeholder. A page whose answer settles its address (`settle`) replaces it, no new history
 * entry, once that page is the one open; the answer is kept for the address replaced to, whose
 * answer then names that address, so it settles once.
 */
function useScreenData<T, L>(screen: Screen<T, L>): Drawn<T> | undefined {
  const { api, access, pages } = useDeps();
  const who = useAccessOf(access);
  const params = useParams();
  const open = useMatches().at(-1)?.id === screen.name;
  const [search, setSearch] = useSearchParams();
  // The same hooks on every draw, whichever screen: the shell's back layer keeps one FramePart
  // from page to page, handing it each page's screen in turn.
  const draft = useTabDraft(screen.live !== undefined);
  const live = screen.live?.(params, draft);
  const asks = live === undefined ? params : live.asks;
  const playId = usePlayId();
  const playing = screen.followsPlayer ? playId : '';
  const key = asks === null ? null : pageKey(screen.name, asks, playing);
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
  const settled =
    live === undefined && kept !== undefined && screen.settle !== undefined
      ? screen.settle(params, kept as L)
      : null;
  const address = open && who === 'member' ? (settled?.address ?? null) : null;
  const settledKey =
    address === null ? null : pageKey(screen.name, { ...params, ...address }, playing);
  const settledSearch = address === null ? null : searchWith(search, address);
  useEffect(() => {
    if (settledKey === null || settledSearch === null || key === null) return;
    const answered = pages.peek(key);
    void pages.load(settledKey, () => Promise.resolve(answered));
    setSearch(settledSearch, { replace: true });
  }, [settledKey, settledSearch, key, pages, setSearch]);
  if (who === 'canvas') return undefined;
  if (live === undefined) {
    const state =
      kept !== undefined
        ? screen.stateOf?.(kept as L)
        : failed && screen.saysFailed === true
          ? 'failed'
          : undefined;
    const inState = { answered: kept !== undefined, ...(state === undefined ? {} : { state }) };
    if (settled !== null) return { data: settled.data, ...inState };
    return { data: (kept as T | undefined) ?? screen.empty(params), ...inState };
  }
  const drawn = live.draw(
    answerFrom(kept as L | undefined, failed),
    last.current?.screen === screen.name ? last.current.drawn : null,
  );
  last.current = { screen: screen.name, drawn };
  return drawn;
}

/** `search` with `values` set in it, as the text of an address's query. */
function searchWith(search: URLSearchParams, values: Params): string {
  const next = new URLSearchParams(search);
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined) next.set(name, value);
  }
  return next.toString();
}

/**
 * The verbs of `screen`'s menu (a library home's: its sorts), for the page to hand down: none on
 * the canvas, or while its menu holds none. A verb's page opens after it, replacing a list
 * deleted; a list changed loads again; a refusal for want of a sign-in goes to sign in, and any
 * other failure is logged, the shell binding no status to show it in.
 */
function useVerbs<T>(screen: Screen<T>, drawn: Drawn<T> | undefined): Choose | null {
  const { api, access, pages } = useDeps();
  const navigate = useNavigate();
  const params = useParams();
  const verbs = screen.verbs;
  const load = screen.load;
  const data = drawn?.data as { menu?: unknown[]; sort?: { options: unknown[] } } | undefined;
  const menu = data?.menu ?? data?.sort?.options ?? [];
  const live = drawn !== undefined && menu.length > 0;
  return useMemo(() => {
    if (verbs === undefined) return null;
    return (ref: string) =>
      !live
        ? undefined
        : (key: string) =>
            void verbs(api, ref, key)
              .then((done) => {
                if (done.open !== undefined)
                  navigate(done.open, { replace: done.replace === true });
                else if (done.reload === true && load !== undefined) {
                  void pages.load(pageKey(screen.name, params), () => load(api, params));
                }
              })
              .catch((error: unknown) => {
                if (error instanceof SignedOut) access.refused();
                else console.warn('the menu failed', key, error);
              });
  }, [verbs, live, api, navigate, pages, load, access, screen.name, params]);
}

/**
 * The changes `screen`'s controls make, a request's verb or a switch set, all in one place. Only one
 * goes at a time for each request or setting: its controls have no handler, and so draw disabled,
 * from the tap until the page has loaded again, so a double tap sends it once. Whether it went
 * through or was refused, the page loads again, to show what the server now holds. A refusal for
 * want of a sign-in goes to sign in, and any other failure is said on the page (`errors`) until the
 * next change.
 */
function useChanges<T, L>(screen: Screen<T, L>) {
  const { api, access, pages } = useDeps();
  const params = useParams();
  const [failure, setFailure] = useState<string | null>(null);
  const [working, setWorking] = useState<ReadonlySet<string>>(new Set());
  const going = useRef(new Set<string>());
  const asks = asksAt(screen, params);
  const make = (what: string, failing: string, change: () => Promise<void>) => {
    if (going.current.has(what)) return;
    going.current.add(what);
    setWorking(new Set(going.current));
    setFailure(null);
    const load = screen.load;
    void change()
      .catch((error: unknown) => {
        if (error instanceof SignedOut) access.refused();
        else {
          console.warn('the change failed', what, error);
          setFailure(error instanceof TooManyRequests ? TOO_MANY_REQUESTS : failing);
        }
      })
      .then(() =>
        load === undefined
          ? undefined
          : pages.reload(pageKey(screen.name, asks), () => load(api, asks)),
      )
      .finally(() => {
        going.current.delete(what);
        setWorking(new Set(going.current));
      });
  };
  return { make, working, failure };
}

type Changes = ReturnType<typeof useChanges>;

/** A request's verbs for the page to hand down: none on the canvas, or for a page of no requests. */
function actsOf<T, L>(
  screen: Screen<T, L>,
  drawn: Drawn<T> | undefined,
  api: ApiClient,
  { make, working }: Changes,
): Act | null {
  const acts = screen.acts;
  if (acts === undefined || drawn === undefined) return null;
  return (ref, verb, candidate) =>
    working.has(ref)
      ? undefined
      : () => make(ref, screen.actFailure?.(verb) ?? '', () => acts(api, ref, verb, candidate));
}

/**
 * A page's requests for it to hand down: none on the canvas. A ref that stands for no request asks
 * for nothing, and the failure a tap leaves names the ref tapped, for the page to say on its row.
 */
function requestsOf<T>(
  drawn: Drawn<T> | undefined,
  api: ApiClient,
  { make, working }: Changes,
): Request | null {
  if (drawn === undefined) return null;
  return (key) => {
    const ref = requestOf(key);
    return ref === null || working.has(key)
      ? undefined
      : () => make(key, key, () => makeRequest(api, ref));
  };
}

/**
 * A page's switches for it to hand down: none on the canvas, or for a page with none that work. A
 * switch takes no tap until the server has said what it holds.
 */
function togglesOf<T, L>(
  screen: Screen<T, L>,
  drawn: Drawn<T> | undefined,
  api: ApiClient,
  { make, working }: Changes,
): Toggle | null {
  const toggles = screen.toggles;
  if (toggles === undefined || drawn === undefined) return null;
  return (setting) =>
    drawn.answered !== true || working.has(setting)
      ? undefined
      : (next) =>
          make(setting, screen.toggleFailure?.(setting) ?? '', () => toggles(api, setting, next));
}

/** What asks again for `screen`'s data while its load has failed: none on the canvas. */
function useRetries<T, L>(screen: Screen<T, L>, drawn: Drawn<T> | undefined) {
  const { pages } = useDeps();
  const key = pageKey(screen.name, useParams());
  return drawn?.state === 'failed' ? () => void pages.retry(key) : undefined;
}

/** `drawn`'s data saying what failed, for a page whose controls change something. */
function sayingFailure<T>(drawn: Drawn<T> | undefined, failure: string | null): T | undefined {
  if (drawn === undefined) return undefined;
  return { ...drawn.data, errors: failure === null ? [] : [{ message: failure }] };
}

/** What `screen` loads at this address when nothing is typed over it. */
const asksAt = <T, L>(screen: Screen<T, L>, params: Params): Params =>
  screen.live?.(params, null).asks ?? params;

/** Looks at `screen` again every so often while it is open and what it holds moves by itself. */
function usePolling<T, L>(screen: Screen<T, L>): void {
  const { api, access, pages } = useDeps();
  const who = useAccessOf(access);
  const params = useParams();
  const open = useMatches().at(-1)?.id === screen.name;
  const asks = asksAt(screen, params);
  const key = pageKey(screen.name, asks);
  const kept = useSyncExternalStore(
    pages.subscribe,
    () => pages.peek(key),
    () => pages.peek(key),
  );
  const moving =
    who === 'member' && open && kept !== undefined && screen.polls?.(kept as L) === true;
  useEffect(() => {
    const load = screen.load;
    if (!moving || load === undefined) return;
    const timer = setInterval(() => void pages.load(key, () => load(api, asks)), POLL_MS);
    return () => clearInterval(timer);
    // `asks` is in `key`.
  }, [moving, key, screen, api, pages]);
}

/** What the player says for `screen`; why a song was refused stays only while its search does. */
function useHeard<T, L>(screen: Screen<T, L>): PlayerHeard {
  const heard = usePlayerHeard();
  const key = pageKey(screen.name, useParams());
  const hears = screen.heard !== undefined;
  useEffect(() => {
    if (hears) return () => playerStore().forgetRefused();
  }, [hears, key]);
  // The song tapped may be far down the page, and the banner that says why is at its head. One the
  // queue stepped over was no tap, so the page stays where it is read.
  const { refused } = heard;
  useEffect(() => {
    if (hears && refused !== null && refused.skipped === undefined) {
      document.querySelector('[role="status"]')?.scrollIntoView({ block: 'center' });
    }
  }, [hears, refused]);
  return heard;
}

const made = new Map<Screen<never>, ComponentType>();

/** The page `screen` draws, given its data. */
function pageOf<T>(screen: Screen<T>): ComponentType {
  const key = screen as unknown as Screen<never>;
  let component = made.get(key);
  if (component === undefined) {
    const Page = screen.Page;
    const playsList = screen.playsList;
    component =
      playsList === undefined
        ? function ScreenPage() {
            const shown = useScreenData(screen);
            const choose = useVerbs(screen, shown);
            const { api } = useDeps();
            const changes = useChanges(screen);
            const act = actsOf(screen, shown, api, changes);
            const request = requestsOf(shown, api, changes);
            const toggle = togglesOf(screen, shown, api, changes);
            const retry = useRetries(screen, shown);
            usePolling(screen);
            const heard = useHeard(screen);
            const said =
              screen.requestFailed !== undefined && shown !== undefined && changes.failure !== null
                ? screen.requestFailed(shown.data, changes.failure)
                : screen.acts === undefined && screen.toggles === undefined
                  ? shown?.data
                  : sayingFailure(shown, changes.failure);
            const data = said === undefined ? said : (screen.heard?.(said, heard) ?? said);
            const page = <Page data={data} state={shown?.state} />;
            return (
              <ChooseContext.Provider value={choose}>
                <ActContext.Provider value={act}>
                  <RequestContext.Provider value={request}>
                    <ToggleContext.Provider value={toggle}>
                      <RetryContext.Provider value={retry}>{page}</RetryContext.Provider>
                    </ToggleContext.Provider>
                  </RequestContext.Provider>
                </ActContext.Provider>
              </ChooseContext.Provider>
            );
          }
        : function ListScreenPage() {
            const shown = useScreenData(screen);
            const play = useListPlay(playsList(useParams()));
            const choose = useVerbs(screen, shown);
            return (
              <PlayContext.Provider value={play}>
                <ChooseContext.Provider value={choose}>
                  <Page data={shown?.data} state={shown?.state} />
                </ChooseContext.Provider>
              </PlayContext.Provider>
            );
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

/** What page `name` loads at an address that gives `params`, as its screen asks the API. */
export const loadPage = (name: string, api: ApiClient, params: Params): Promise<unknown> =>
  screens.find((s) => s.name === name)?.load?.(api, params) ??
  Promise.reject(new Error(`page ${name} loads nothing`));

/** The generated routes, every page with data drawn as its screen. */
export function withPageData(routes: RouteObject[]): RouteObject[] {
  return routes.map(bind);
}
