import {
  createElement,
  isValidElement,
  useEffect,
  useSyncExternalStore,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import { type RouteObject, useMatches } from 'react-router';
import { type ApiClient } from '../api/client';
import { type FrameContext, type PageFrame } from '../generated/nav/platform';
import { type ShellHandle, type ShellTabs } from '../generated/nav/Shell';
import Album, { frame as albumFrame } from '../generated/pages/Album';
import Book, { frame as bookFrame } from '../generated/pages/Book';
import Books, { frame as booksFrame } from '../generated/pages/Books';
import Music, { frame as musicFrame } from '../generated/pages/Music';
import Podcasts, { frame as podcastsFrame } from '../generated/pages/Podcasts';
import Queue, { type QueueData } from '../generated/pages/Queue';
import Show, { frame as showFrame } from '../generated/pages/Show';
import SignIn from '../generated/pages/SignIn';
import { usePlayId } from '../player';
import { useAccessOf } from './access';
import { useDeps } from './deps';
import { emptied } from './format';
import { albumData, bookData, showData } from './items';
import { booksData, musicData, podcastsData } from './library';
import { emptyQueue, queueData } from './queue';
import { SignInScreen } from './sign-in';
import { loadItem, loadLibrary, loadQueues } from './loads';

/**
 * The generated pages given their data. `withPageData(routes)` swaps each page that has data for
 * its screen, wherever the route table draws it: a route's page, the page a player sheet is drawn
 * over, a player tab's page in the side panel, and the back layer and subheader the page's frame
 * hands the shell. One screen per page: the library homes from `GET /api/library/{medium}`, a book,
 * show or album from `GET /api/items/{ref}`, the queue from `GET /api/queues/{active}`, sign in
 * from the address. Now Playing reads the player itself. A page loading shows its lists empty; on
 * a server nobody can sign in to, every page keeps its canvas placeholder (`access.ts`); a request
 * refused for want of a sign-in goes to sign in.
 */

type Params = Readonly<Record<string, string | undefined>>;

/** One page's data: what it draws while loading, and how it loads. */
interface Screen<T> {
  name: string;
  Page: ComponentType<{ data?: T }>;
  frame?: PageFrame<T>;
  empty: T;
  /** Whether its data changes with what the player plays. */
  followsPlayer?: boolean;
  load(api: ApiClient, params: Params): Promise<T>;
}

const screens: Screen<never>[] = [
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
] as Screen<never>[];

/** The data `screen` shows here: undefined on the canvas, which draws the page's placeholder. */
function useScreenData<T>(screen: Screen<T>): T | undefined {
  const { api, access, pages } = useDeps();
  const who = useAccessOf(access);
  const params = useMatches().at(-1)?.params ?? {};
  const playId = usePlayId();
  const key = `${screen.name}${JSON.stringify(params)}${screen.followsPlayer ? playId : ''}`;
  const kept = useSyncExternalStore(
    pages.subscribe,
    () => pages.peek(key),
    () => pages.peek(key),
  );
  useEffect(() => {
    if (who === 'member') void pages.load(key, () => screen.load(api, params));
    else if (who === 'signedOut') access.signIn();
    // `params` is in `key`.
  }, [who, key, screen, api, pages, access]);
  if (who === 'canvas') return undefined;
  return (kept as T | undefined) ?? screen.empty;
}

const made = new Map<Screen<never>, ComponentType>();

/** The page `screen` draws, given its data. */
function pageOf<T>(screen: Screen<T>): ComponentType {
  const key = screen as unknown as Screen<never>;
  let component = made.get(key);
  if (component === undefined) {
    const Page = screen.Page;
    component = function ScreenPage() {
      return <Page data={useScreenData(screen)} />;
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
  const data = useScreenData(props.screen) ?? props.frame.placeholder;
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
