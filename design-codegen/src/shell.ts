/**
 * The app shell every page sits in, Sonora's Material backdrop: `BackdropShell` and its
 * `BackLayer`, with the destinations as a bottom bar, an icon rail or a labelled rail by
 * nav.json's layouts, the mini-player once something is loaded, and the Now Playing panel from
 * the layout that names it. `design/app/shell.json` holds what the shell shows that no page owns.
 *
 * A page gives only what is its own, as the root of its file:
 *
 *   <BackdropShell back={<BackLayer controls={…} trailing={…} />} subheader={<FrontLayerHeader …/>}>
 *     …the front layer's content…
 *   </BackdropShell>
 *
 * The shell fills in the rest: the heading (nav.json's title for the page, unless the page binds
 * its own from its data, `title={data.title}`, as an album does with its name, and a shelf with its subject in the heading's context form), what leads it (the account avatar
 * on a phone's destination home, a close control on a page that closes), the rail or bottom bar
 * with the rail's hamburger, the player and the side panel. On the phone a page that is not a
 * destination has no backdrop: its heading is a top app bar on the page surface. On desktop it
 * stays in the backdrop of the destination it lights. A bare page, signing in or first-run setup,
 * is its heading and its content alone, with no navigation, player or account: a top app bar on
 * the phone, the backdrop with no rail on desktop. A page whose root is anything else is its front layer's content
 * alone. The account avatar is the shell's alone: a page never draws one, so it is never in a
 * filter row.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Nav, NavPage } from './nav.js';
import type { PageTree, PropValue } from './page.js';

const Shell = z
  .object({
    /** The account avatar leading the phone's top bar. */
    account: z.object({ label: z.string().min(1), image: z.string().optional() }).strict(),
    /** What is loaded; null when nothing is, and then there is no mini-player or panel. */
    playing: z
      .object({
        title: z.string().min(1),
        artist: z.string().min(1),
        image: z.string().optional(),
        context: z.string().optional(),
        /** Which transport it takes: music's, or spoken content's skip and speed. */
        variant: z.enum(['music', 'spoken']),
        favourite: z.boolean(),
        progress: z.number().min(0).max(1),
        duration: z.number().positive(),
        /** The sleep timer's state, "Off" or what is left of it. */
        sleep: z.string().min(1),
        /** The about card under the player: the artist, show or book of what is loaded. */
        about: z
          .object({
            title: z.string().min(1),
            heading: z.string().min(1),
            meta: z.string().optional(),
            image: z.string().optional(),
            body: z.string().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .nullable(),
    /** Pages pinned to the foot of the rail, drawn as rows like the destinations. */
    railFoot: z.array(z.object({ page: z.string(), icon: z.string().min(1) }).strict()),
    /** The page the player's sheets are drawn over where the side panel holds them; needed once one is drawn. */
    sheetOver: z.string().optional(),
  })
  .strict();

export type ShellFile = z.infer<typeof Shell>;

export function readShell(appDir: string): ShellFile {
  return Shell.parse(JSON.parse(readFileSync(join(appDir, 'shell.json'), 'utf8')));
}

type Layout = Nav['layouts'][number];

/** A layout's id in generated code: `w` and its minimum width, `w600`. */
export const layoutId = (layout: Layout) => `w${layout.minWidth}`;

/** The layout a window `width` px wide gets: the last whose minimum it reaches. */
export function layoutAt(nav: Nav, width: number): Layout {
  const fits = nav.layouts.filter((l) => l.minWidth <= width);
  const layout = fits[fits.length - 1] ?? nav.layouts[0];
  if (layout === undefined) throw new Error('nav.json has no layouts');
  return layout;
}

export const platformOf = (layout: Layout) => (layout.nav === 'bottomBar' ? 'mobile' : 'desktop');

interface NavItem {
  key: string;
  label: string;
  icon: string;
}

/**
 * What the shell's trees bind to as `shell.…`: shell.json plus each layout's destinations, in its
 * order, and each page's filter. A page may bind it too, for what it shows from nav.json.
 */
export interface ShellData {
  account: ShellFile['account'];
  playing: ShellFile['playing'];
  /** The panel's playback state, from what is loaded: playing, how far and how long, and whether a favourite. */
  transport: { playing: boolean; progress: number; duration: number; favourite: boolean } | null;
  /** The rail's foot. */
  footer: NavItem[];
  /** Each layout's destinations, by layout id. */
  nav: Record<string, NavItem[]>;
  /** Each filtered page's choices, by page id: its `all`, then its destinations' labels. */
  filters: Record<string, string[]>;
}

export function shellData(nav: Nav, shell: ShellFile): ShellData {
  const item = (id: string): NavItem => {
    const d = nav.destinations.find((x) => x.id === id);
    if (d === undefined) throw new Error(`${id} is not a destination`);
    return { key: d.id, label: d.label, icon: d.icon };
  };
  return {
    account: shell.account,
    playing: shell.playing,
    transport:
      shell.playing === null
        ? null
        : {
            playing: true,
            progress: shell.playing.progress,
            duration: shell.playing.duration,
            favourite: shell.playing.favourite,
          },
    footer: shell.railFoot.map(({ page, icon }) => {
      const p = nav.pages.find((x) => x.id === page);
      if (p === undefined) throw new Error(`shell.json: railFoot names ${page}, not a page`);
      return { key: p.id, label: p.title, icon };
    }),
    nav: Object.fromEntries(nav.layouts.map((l) => [layoutId(l), l.order.map(item)])),
    filters: Object.fromEntries(
      nav.pages.flatMap(({ id, filter }) =>
        filter === undefined
          ? []
          : [[id, [filter.all, ...filter.narrows.map((d) => item(d).label)]]],
      ),
    ),
  };
}

/** The shell's parts for one page at one layout, each a tree of Sonora elements. */
export interface Chrome {
  platform: 'mobile' | 'desktop';
  /** A page that is not a destination, on the phone: a top app bar in place of the backdrop. */
  appBar: boolean;
  rail?: PageTree;
  leading?: PageTree;
  player?: PageTree;
  sheet?: PageTree;
  sheetOpen: boolean;
}

const lit = (value: string | number | boolean): PropValue => ({ kind: 'literal', value });
const bind = (path: string): PropValue => ({ kind: 'binding', path: path.split('.') });
const el = (component: string, props: Record<string, PropValue>): PageTree => ({
  kind: 'element',
  component,
  line: 0,
  props,
  children: [],
});

/** The components the shell draws with, around any page. */
export const SHELL_COMPONENTS = [
  'AccountButton',
  'BackLayer',
  'BackdropShell',
  'BottomNav',
  'IconButton',
  'MiniPlayer',
  'NavRail',
  'NowPlaying',
];

/** Each of the player's sheets in nav.json, as the tab of Sonora's NowPlaying it is. */
export const PLAYER_TABS: Readonly<Record<string, string>> = {
  nowPlaying: 'now',
  queue: 'queue',
  lyrics: 'lyrics',
};

/** Whether a layout holds the player in the side panel, rather than as a full-screen sheet. */
export const holdsPanel = (layout: Layout) => layout.sidePanel === 'nowPlaying';

/**
 * The player open on `tab`, what is loaded in shell.json: `content` is the tab's page, a player
 * sheet's own, or Now Playing's in every page's panel; with none, as when Now Playing is not yet
 * drawn, Sonora builds the tab from what is loaded.
 */
export function playerTree(tab: string, content: PageTree[]): PageTree {
  return {
    kind: 'element',
    component: 'NowPlaying',
    line: 0,
    props: {
      open: lit(true),
      tab: lit(tab),
      variant: bind('shell.playing.variant'),
      track: bind('shell.playing'),
      ...(content.length === 0 ? { player: bind('shell.transport') } : {}),
    },
    children: content,
  };
}

/** A player sheet's tab, from nav.json's page; throws for a page that is not one of them. */
export function playerTab(page: NavPage): string {
  const tab = PLAYER_TABS[page.id];
  if (page.presentation !== 'sheet' || tab === undefined) {
    throw new Error(
      `${page.id} is not one of the player's sheets (${Object.keys(PLAYER_TABS).join(', ')})`,
    );
  }
  return tab;
}

/**
 * The shell around `page` at `layout`. Each tree carries its platform as a literal wherever
 * `platformed` says the component takes one, so it reads the same wherever it is placed. `now` is
 * Now Playing's page, which the side panel shows on every page, so every panel is the same.
 */
export function chrome(
  nav: Nav,
  shell: ShellFile,
  page: NavPage,
  layout: Layout,
  platformed: Set<string>,
  now: PageTree[] = [],
): Chrome {
  const platform = platformOf(layout);
  const id = layoutId(layout);
  const phone = layout.nav === 'bottomBar';
  const destination = nav.destinations.some((d) => d.id === page.id);
  const active = page.lights ?? shell.railFoot.find((f) => f.page === page.id)?.page;
  const withPlatform = (tree: PageTree): PageTree => {
    if (tree.kind === 'text' || tree.kind === 'binding') return tree;
    const children = tree.children.map(withPlatform);
    if (tree.kind !== 'element' || !platformed.has(tree.component)) return { ...tree, children };
    return { ...tree, props: { ...tree.props, platform: lit(platform) }, children };
  };
  const mini =
    shell.playing === null
      ? undefined
      : el('MiniPlayer', {
          title: bind('shell.playing.title'),
          artist: bind('shell.playing.artist'),
          ...(shell.playing.image === undefined ? {} : { image: bind('shell.playing.image') }),
          playing: lit(true),
          progress: bind('shell.playing.progress'),
          duration: bind('shell.playing.duration'),
          variant: bind('shell.playing.variant'),
          sleep: bind('shell.playing.sleep'),
        });
  const leading =
    page.close !== 'none'
      ? el('IconButton', { icon: lit('close'), label: lit('Close') })
      : phone
        ? el('AccountButton', {
            label: bind('shell.account.label'),
            ...(shell.account.image === undefined ? {} : { image: bind('shell.account.image') }),
          })
        : undefined;
  // A bare page is its heading and its content alone: a top app bar on the phone, the back
  // layer's heading over the front layer on desktop, with no rail beside them.
  if (page.presentation === 'bare') return { platform, appBar: phone, sheetOpen: false };
  const parts: Chrome = { platform, appBar: phone && !destination, leading, sheetOpen: false };
  if (phone) {
    const bar = el('BottomNav', { items: bind(`shell.nav.${id}`), active: lit(page.lights ?? '') });
    parts.player = mini === undefined ? bar : { kind: 'fragment', children: [mini, bar] };
  } else {
    parts.rail = el('NavRail', {
      items: bind(`shell.nav.${id}`),
      ...(shell.railFoot.length > 0 ? { footerItems: bind('shell.footer') } : {}),
      ...(active === undefined ? {} : { active: lit(active) }),
      expanded: lit(layout.nav === 'labelledRail'),
      toggle: lit(true),
    });
    parts.player = mini;
    if (holdsPanel(layout) && shell.playing !== null) {
      parts.sheet = playerTree('now', now);
      parts.sheetOpen = true;
    }
  }
  for (const key of ['rail', 'leading', 'player', 'sheet'] as const) {
    const tree = parts[key];
    if (tree === undefined) delete parts[key];
    else parts[key] = withPlatform(tree);
  }
  return parts;
}

/** The back layer's props that name a page by its subject, SectionHeader's context form. */
const CONTEXT = ['eyebrow', 'image', 'round'] as const;

/** What a page gives the shell: its back layer's controls, trailing and local search, its subheader, and its content. */
export interface PageFrame {
  /** The heading bound to the page's data, `title={data.title}`, in place of nav.json's title. */
  title?: Extract<PropValue, { kind: 'binding' }>;
  /** The heading's context form, each bound to the page's data: what the page is to its subject, the subject's art, and whether that art is round. */
  context?: Partial<Record<(typeof CONTEXT)[number], Extract<PropValue, { kind: 'binding' }>>>;
  controls?: PageTree;
  /** The back layer's local search: its placeholder, which names what it searches. */
  search?: string;
  trailing?: PageTree;
  subheader?: PageTree;
  content: PageTree[];
}

function contains(tree: PageTree, component: string): number | undefined {
  if (tree.kind === 'element') {
    if (tree.component === component) return tree.line;
    for (const value of Object.values(tree.props)) {
      const line = value.kind === 'slot' ? contains(value.tree, component) : undefined;
      if (line !== undefined) return line;
    }
  }
  if ('children' in tree) {
    for (const child of tree.children) {
      const line = contains(child, component);
      if (line !== undefined) return line;
    }
  }
  return undefined;
}

/** Splits a page into what it gives the shell; throws naming each thing a page may not set. */
export function framePage(tree: PageTree): PageFrame {
  const errors: string[] = [];
  const avatar = contains(tree, 'AccountButton');
  if (avatar !== undefined) {
    errors.push(
      `line ${avatar}: the account avatar is the shell's, leading the top bar; a page never draws one, so never in a filter row`,
    );
  }
  const frame: PageFrame = { content: [tree] };
  if (tree.kind === 'element' && tree.component === 'BackdropShell') {
    frame.content = tree.children;
    for (const [prop, value] of Object.entries(tree.props)) {
      if (prop === 'subheader' && value.kind === 'slot') frame.subheader = value.tree;
      else if (
        prop === 'back' &&
        value.kind === 'slot' &&
        value.tree.kind === 'element' &&
        value.tree.component === 'BackLayer'
      ) {
        for (const [p, v] of Object.entries(value.tree.props)) {
          if ((p === 'controls' || p === 'trailing') && v.kind === 'slot') frame[p] = v.tree;
          else if (p === 'title' && v.kind === 'binding' && v.path[0] === 'data') frame.title = v;
          else if ((CONTEXT as readonly string[]).includes(p)) {
            if (v.kind === 'binding' && v.path[0] === 'data') {
              frame.context = { ...frame.context, [p]: v };
            } else {
              errors.push(
                `line ${value.tree.line}: BackLayer.${p} names the page's subject; a page may only bind its own data.… there`,
              );
            }
          } else if (p === 'title') {
            errors.push(
              `line ${value.tree.line}: BackLayer.title is nav.json's page title; a page may only bind its own data.… in its place`,
            );
          } else if (p === 'search' && v.kind === 'literal' && typeof v.value === 'string') {
            frame.search = v.value;
          } else if (p === 'search') {
            errors.push(
              `line ${value.tree.line}: BackLayer.search is the placeholder text, a string written in the page`,
            );
          } else {
            errors.push(
              `line ${value.tree.line}: BackLayer.${p} is the shell's; a page gives only controls and trailing, each one element, search, a bound title and its bound context`,
            );
          }
        }
      } else {
        errors.push(
          `line ${tree.line}: BackdropShell.${prop} is the shell's; a page gives only back (one BackLayer) and subheader`,
        );
      }
    }
  }
  if (errors.length > 0) throw new Error(errors.join('\n  '));
  return frame;
}

/**
 * The page's whole tree inside the shell: `BackdropShell` with the page's content as its
 * children and the shell's parts given as `parts` says, bindings in the web page or the chrome's
 * own trees on the canvas. The heading is the page's bound one, or else `title`, nav.json's.
 */
export function framed(
  frame: PageFrame,
  title: string,
  parts: Partial<
    Record<'rail' | 'leading' | 'player' | 'sheet' | 'sheetOpen' | 'appBar', PropValue>
  >,
): PageTree {
  const named = (name: string, tree: PageTree | undefined): Record<string, PropValue> =>
    tree === undefined ? {} : { [name]: { kind: 'slot', tree } };
  const given = (name: keyof typeof parts) =>
    parts[name] === undefined ? {} : { [name]: parts[name]! };
  const back = el('BackLayer', {
    title: frame.title ?? lit(title),
    ...frame.context,
    ...(parts.leading === undefined ? {} : { leading: parts.leading }),
    ...named('controls', frame.controls),
    ...named('trailing', frame.trailing),
    ...(frame.search === undefined ? {} : { search: lit(frame.search) }),
  });
  return {
    kind: 'element',
    component: 'BackdropShell',
    line: 0,
    props: {
      ...given('rail'),
      back: { kind: 'slot', tree: back },
      ...named('subheader', frame.subheader),
      ...given('player'),
      ...given('sheet'),
      ...given('sheetOpen'),
      ...given('appBar'),
    },
    children: frame.content,
  };
}
