/**
 * `design/app/nav.json`: the destinations, the layouts per width and every page of the app, and
 * the web route table generated from it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { APP_NOTE } from './outputs.js';
import { holdsPanel, layoutId, panelOver, platformOf, PLAYER_TABS } from './shell.js';

const Id = z.string().regex(/^[a-z][A-Za-z0-9]*$/, 'a camelCase id');

const Destination = z
  .object({ id: Id, label: z.string().min(1), icon: z.string().min(1) })
  .strict();

/**
 * One width band: its navigation, the destinations in the order it shows them, and a side panel
 * holding the player, with when it opens, always or from the mini-player, and where it sits:
 * beside the page, or over it as a modal side sheet, its scrim behind it, where the page would be
 * too narrow beside it. A panel open always sits beside the page, never over every page.
 */
const Layout = z
  .object({
    minWidth: z.number().int().nonnegative(),
    nav: z.enum(['bottomBar', 'iconRail', 'labelledRail']),
    order: z.array(Id),
    sidePanel: z.literal('nowPlaying').optional(),
    sidePanelOpens: z.enum(['always', 'fromMiniPlayer']).optional(),
    sidePanelSits: z.enum(['beside', 'over']).optional(),
  })
  .strict()
  .refine((l) => (l.sidePanel === undefined) === (l.sidePanelOpens === undefined), {
    message: 'a side panel says when it opens (sidePanelOpens), and only a side panel does',
    path: ['sidePanelOpens'],
  })
  .refine((l) => (l.sidePanel === undefined) === (l.sidePanelSits === undefined), {
    message: 'a side panel says where it sits (sidePanelSits), and only a side panel does',
    path: ['sidePanelSits'],
  })
  .refine((l) => !(l.sidePanelOpens === 'always' && l.sidePanelSits === 'over'), {
    message: 'a side panel open always sits beside the page (sidePanelSits), not over it',
    path: ['sidePanelSits'],
  });

/**
 * What back does, the same on every page. The close control (✕ or up) returns to whatever opened
 * the page, a stack of openers rather than a fixed parent, and each destination keeps its own
 * stack, so leaving Music and coming back resumes it. A page opened with nothing under it closes
 * to the home of the destination it lights, or Browse. Android's system back is the close
 * control; the web browser's back goes to the previous view, wherever that was.
 */
const Back = z
  .object({
    close: z.literal('opener'),
    stacks: z.literal('perDestination'),
    android: z.literal('close'),
    web: z.literal('previousView'),
  })
  .strict();

/** What a page is compared against: a UI kit screen, a showcase card, or nothing in Sonora. */
export const SonoraSource = z
  .string()
  .regex(
    /^(kit:(mobile|desktop)\/[a-z]+|card:[a-z0-9-]+|none)$/,
    'kit:<platform>/<screen>, card:<stem> or none',
  );

/**
 * What a page is for, read before any render: its purpose, its sections in order (a provisional
 * one is not settled yet), what it shows with nothing to show, and the pages it links to.
 */
const Structure = z
  .object({
    purpose: z.string().min(1),
    sections: z
      .array(
        z
          .object({
            name: z.string().min(1),
            holds: z.string().min(1),
            provisional: z.literal(true).optional(),
          })
          .strict(),
      )
      .min(1),
    empty: z.string().min(1),
    links: z.array(Id),
  })
  .strict();

/**
 * A page's filter, a single choice on its back layer: `all`, then the destinations it narrows to,
 * in its order, each labelled as its destination is, so the filter cannot drift from them.
 */
const Filter = z.object({ all: z.string().min(1), narrows: z.array(Id).min(1) }).strict();

const Page = z
  .object({
    id: Id,
    route: z.string().regex(/^(\*|\/[^?]*(\?[a-z][A-Za-z0-9]*(&[a-z][A-Za-z0-9]*)*)?)$/),
    params: z.record(z.string(), z.string().min(1)).default({}),
    /** The destination lit when the page opens with nothing under it; from another, it joins that one's stack. */
    lights: Id.nullable(),
    /**
     * What the page's close control does: `opener` pops back to what opened it, `sheet` closes the
     * sheet to the page under it, `none` is the bottom of a stack, with nothing to close.
     */
    close: z.enum(['opener', 'sheet', 'none']),
    /**
     * How the shell shows the page: a `screen` in it, one of the player's `sheet`s, or `bare`, a
     * screen before the app is yours (signing in, first-run setup), with no navigation, player or
     * account around it, only its heading.
     */
    presentation: z.enum(['screen', 'sheet', 'bare']),
    platforms: z
      .array(z.enum(['web', 'android']))
      .min(1)
      .default(['web', 'android']),
    title: z.string().min(1),
    endpoint: z.string().optional(),
    sources: z
      .object({
        sonora: z.array(SonoraSource).min(1),
        spotify: z.array(z.string().regex(/^S\d\d$/)),
        kickoff: z.string().optional(),
      })
      .strict(),
    structure: Structure,
    filter: Filter.optional(),
  })
  .strict();

const NavFile = z
  .object({
    destinations: z.array(Destination),
    layouts: z.array(Layout),
    back: Back,
    pages: z.array(Page),
  })
  .strict();

export type Nav = z.infer<typeof NavFile>;
export type NavPage = Nav['pages'][number];

/** A route's path, as the router matches it, and the query names it reads. */
export function splitRoute(route: string): { path: string; query: string[] } {
  const [path = '', query] = route.split('?');
  return { path, query: query === undefined ? [] : query.split('&') };
}

/** Parses nav.json's content, then checks what the schema alone cannot: every id it refers to. */
export function parseNav(json: unknown): Nav {
  const nav = NavFile.parse(json);
  const errors: string[] = [];
  const destinations = new Set(nav.destinations.map((d) => d.id));
  const ids = new Set<string>();
  const all = [...destinations].sort().join();
  for (const layout of nav.layouts) {
    if ([...layout.order].sort().join() !== all) {
      errors.push(
        `${layout.nav} from ${layout.minWidth}: orders [${layout.order}], not each destination once`,
      );
    }
  }
  for (const page of nav.pages) {
    if (ids.has(page.id)) errors.push(`${page.id}: declared twice`);
    ids.add(page.id);
  }
  for (const page of nav.pages) {
    if (page.lights !== null && !destinations.has(page.lights)) {
      errors.push(`${page.id}: lights ${page.lights}, which is not a destination`);
    }
    if (destinations.has(page.id) && page.close !== 'none') {
      errors.push(
        `${page.id}: a destination's home is the bottom of its stack, so its close is none`,
      );
    }
    if ((page.presentation === 'sheet') !== (page.close === 'sheet')) {
      errors.push(`${page.id}: a sheet, and only a sheet, closes as a sheet`);
    }
    if (page.presentation === 'bare' && page.close !== 'none') {
      errors.push(`${page.id}: a bare page is the bottom of its stack, so its close is none`);
    }
    if (page.presentation === 'bare' && page.lights !== null) {
      errors.push(`${page.id}: a bare page lights no destination, since it shows none`);
    }
    if (page.presentation === 'bare' && destinations.has(page.id)) {
      errors.push(`${page.id}: a bare page is no destination, since it shows no navigation`);
    }
    const narrows = page.filter?.narrows ?? [];
    if (new Set(narrows).size !== narrows.length)
      errors.push(`${page.id}: its filter narrows to a destination twice`);
    for (const id of narrows) {
      if (!destinations.has(id))
        errors.push(`${page.id}: its filter narrows to ${id}, which is not a destination`);
    }
    const links = page.structure.links;
    if (new Set(links).size !== links.length) errors.push(`${page.id}: links to a page twice`);
    for (const link of links) {
      if (link === page.id) errors.push(`${page.id}: links to itself`);
      else if (!ids.has(link)) errors.push(`${page.id}: links to ${link}, which is not a page`);
    }
    const inRoute = [...splitRoute(page.route).path.matchAll(/:([A-Za-z0-9]+)/g)].map((m) => m[1]);
    const declared = Object.keys(page.params);
    if (inRoute.sort().join() !== declared.sort().join()) {
      errors.push(`${page.id}: route parameters [${inRoute}] differ from params [${declared}]`);
    }
  }
  if (errors.length > 0) throw new Error(`nav.json:\n  ${errors.join('\n  ')}`);
  return nav;
}

export function readNav(appDir: string): Nav {
  return parseNav(JSON.parse(readFileSync(join(appDir, 'nav.json'), 'utf8')));
}

/** A page id as its component name: `nowPlaying` is `NowPlaying`. */
export const componentName = (id: string) => id[0]!.toUpperCase() + id.slice(1);

const literal = (value: unknown) => JSON.stringify(value).replaceAll('"', "'");

/**
 * `routes.tsx`: the destinations, layouts and web pages as data, and the React Router table: one
 * pathless route holding the shell, generated as `Shell.tsx`, with every page a child of it, so
 * the shell and its rail stay mounted from page to page. Each drawn page's route renders its
 * content and hands the shell its frame; a player sheet's hands it the page it is drawn over,
 * `over` (shell.json's `sheetOver`), for the layouts whose side panel holds the player. The
 * player's sheets are children of one pathless route drawing the shell's `Player`, so switching
 * its tabs changes only the tab's page inside the one player. A page not yet drawn (no
 * `pages/<id>.page.jsx`) gets a route with no element.
 */
export function generateRoutes(nav: Nav, drawn: Set<string>, over?: string): string {
  const pages = nav.pages.filter((p) => p.platforms.includes('web'));
  const sheet = (p: NavPage) => p.presentation === 'sheet';
  if (over !== undefined && !drawn.has(over) && pages.some((p) => sheet(p) && drawn.has(p.id))) {
    throw new Error(`shell.json: sheetOver names ${over}, which is not drawn`);
  }
  const imports = pages
    .filter((p) => drawn.has(p.id))
    .map((p) => {
      const name = componentName(p.id);
      return sheet(p)
        ? `import ${name} from '../pages/${name}';`
        : `import ${name}, { frame as ${name}Frame } from '../pages/${name}';`;
    });
  const rows = pages.map((p) => {
    const { path, query } = splitRoute(p.route);
    return (
      `  { id: ${literal(p.id)}, path: ${literal(path)}, query: ${literal(query)}, ` +
      `title: ${literal(p.title)}, lights: ${literal(p.lights)}, close: ${literal(p.close)}, ` +
      `presentation: ${literal(p.presentation)} },`
    );
  });
  const route = (p: NavPage, indent: string) => {
    const { path } = splitRoute(p.route);
    const name = componentName(p.id);
    const under = over === undefined ? undefined : componentName(over);
    const handle = sheet(p)
      ? under === undefined
        ? ''
        : `, handle: { over: { frame: ${under}Frame, Page: ${under} } }`
      : `, handle: { frame: ${name}Frame }`;
    const element = drawn.has(p.id) ? `, element: <${name} />${handle}` : '';
    return `${indent}{ id: ${literal(p.id)}, path: ${literal(path)}${element} },`;
  };
  const first = pages.findIndex(sheet);
  const player = [
    '      {',
    "        id: 'player',",
    '        element: <Player />,',
    '        children: [',
    ...pages.filter(sheet).map((p) => route(p, '          ')),
    '        ],',
    '      },',
  ];
  const routes = pages.flatMap((p, at) =>
    sheet(p) ? (at === first ? player : []) : [route(p, '      ')],
  );
  return [
    `// ${APP_NOTE}`,
    "import type { RouteObject } from 'react-router';",
    `import { ${first >= 0 ? 'Player, ' : ''}Shell } from './Shell';`,
    ...imports,
    '',
    `export const destinations = ${JSON.stringify(nav.destinations, null, 2)} as const;`,
    '',
    `export const layouts = ${JSON.stringify(nav.layouts, null, 2)} as const;`,
    '',
    `export const back = ${JSON.stringify(nav.back, null, 2)} as const;`,
    '',
    'export interface PageRoute {',
    '  id: string;',
    '  path: string;',
    '  query: readonly string[];',
    '  title: string;',
    '  lights: string | null;',
    "  close: 'opener' | 'sheet' | 'none';",
    "  presentation: 'screen' | 'sheet' | 'bare';",
    '}',
    '',
    'export const pages: readonly PageRoute[] = [',
    ...rows,
    '];',
    '',
    '/** The shell, mounted once, and every page inside it. */',
    'export const routes: RouteObject[] = [',
    '  {',
    "    id: 'shell',",
    '    element: <Shell />,',
    '    children: [',
    ...routes,
    '    ],',
    '  },',
    '];',
    '',
  ].join('\n');
}

/**
 * `Shell.tsx`: the one `BackdropShell` around every web page, as Sonora Prime's app holds one
 * rail whose lit item changes in place. It draws the page showing's frame, handed up by its route:
 * the shell's parts at the window's layout, the page's back layer and subheader, and the page's
 * content in the front layer. A player sheet is the side panel beside the page it is drawn over
 * where the layout holds one, or over that page as a modal side sheet, its scrim closing it, where
 * the layout says the panel sits over the page; and on its own, full screen, where it holds none.
 * On desktop the panel shows the tab the mini-player's Queue or Lyrics holds beside the page
 * showing, which stays, or else Now Playing where the layout opens its panel of its own. The
 * front layer keeps each location's own scroll, and each location's back layer starts afresh.
 *
 * The player is `Player`, Sonora's NowPlaying drawn once with what is loaded, `player.playing`:
 * full screen it is the route over the player's sheets (`sheets`, each page's tab), the matched
 * sheet its tab and its page the content; in the panel it is at the tab the shell gives it, that
 * tab's page the content. Its tabs switch only the content, so the sheet or panel stays. Its close
 * goes to the page under it, or with nothing under it to `player.home`'s home.
 */
export function generateWebShell(
  sheets: Readonly<Record<string, string>>,
  player: { playing: unknown; home: string },
): string {
  const tabs = Object.entries(sheets);
  return [
    `// ${APP_NOTE}`,
    "import { cloneElement, isValidElement, useContext, type ComponentProps, type ComponentType } from 'react';",
    "import { useLocation, useMatches, useOutlet } from 'react-router';",
    "import { InPanel, useShellNav } from '../../shell-nav';",
    "import { BackdropShell, NowPlaying } from '../ui/index.js';",
    "import { PANEL, PANEL_OVER, PLATFORM, useLayout, type PageFrame, type Platform } from './platform';",
    ...tabs.map(([id]) => `import ${componentName(id)}Tab from '../pages/${componentName(id)}';`),
    '',
    "/** What a page's route hands the shell: its frame, or, for a player sheet, the page it is drawn over. */",
    'export interface ShellHandle {',
    '  frame?: PageFrame<unknown>;',
    '  over?: { frame: PageFrame<unknown>; Page: ComponentType };',
    '}',
    '',
    '/** What is loaded, as the player shows it. */',
    `const playing = ${JSON.stringify(player.playing ?? {}, null, 2)};`,
    '',
    "/** Each of the player's sheets, by its route's id, as the tab it is. */",
    `const TABS: Record<string, string> = { ${tabs.map(([id, tab]) => `${id}: ${literal(tab)}`).join(', ')} };`,
    '',
    "/** Each of the player's tabs, by key, as its sheet's page, which the panel draws at it. */",
    `const PANEL_TABS: Record<string, ComponentType> = { ${tabs
      .map(([id, tab]) => `${tab}: ${componentName(id)}Tab`)
      .join(', ')} };`,
    '',
    'export interface PlayerProps {',
    "  /** The tab, in the panel; left out, the matched sheet's, full screen, its route's page the content. */",
    '  tab?: string;',
    '  /** Whether it has a close: never the panel the layout always opens, whatever its tab. */',
    '  closes?: boolean;',
    '}',
    '',
    "/** The one player: Sonora's NowPlaying, whose tabs change only the page inside it. */",
    'export function Player({ tab, closes = true }: PlayerProps) {',
    '  const go = useShellNav();',
    '  const inPanel = useContext(InPanel);',
    "  const platform: Platform = inPanel || PANEL[useLayout()] ? 'desktop' : 'mobile';",
    '  const outlet = useOutlet();',
    "  const shown = tab ?? TABS[useMatches().at(-1)?.id ?? ''];",
    '  const Content = tab === undefined ? undefined : PANEL_TABS[tab];',
    '  return (',
    `    <NowPlaying open={true} tab={shown} variant={playing.variant as ComponentProps<typeof NowPlaying>['variant']} track={playing} onClose={closes ? () => go.close(${literal(player.home)}) : undefined} onTabChange={(to) => go.tab(to)} platform={platform}>`,
    '      {Content === undefined ? outlet : <Content />}',
    '    </NowPlaying>',
    '  );',
    '}',
    '',
    'export function Shell() {',
    '  const layout = useLayout();',
    '  const go = useShellNav();',
    '  const location = useLocation();',
    '  const outlet = useOutlet();',
    '  const match = useMatches().at(-1);',
    '  const handle = match?.handle as ShellHandle | undefined;',
    '  const over = handle?.over;',
    '  const frame = over === undefined ? handle?.frame : PANEL[layout] ? over.frame : undefined;',
    '  if (frame === undefined) return outlet;',
    '  const chrome = frame.chrome[layout](go);',
    '  const platform = PLATFORM[layout];',
    '  const context = { platform, leading: chrome.leading };',
    '  const where = location.pathname + location.search;',
    '  const back = frame.back(frame.placeholder, context);',
    '  const Over = over?.Page;',
    "  // The panel: a sheet's own tab, the one the mini-player holds, or the layout's own Now Playing.",
    "  const tab = platform !== 'desktop' ? undefined : over !== undefined ? TABS[match?.id ?? ''] : (go.panel() ?? (chrome.sheetOpen ? 'now' : undefined));",
    '  return (',
    '    <BackdropShell',
    '      rail={chrome.rail}',
    '      back={isValidElement(back) ? cloneElement(back, { key: where }) : back}',
    '      subheader={frame.subheader?.(frame.placeholder, context)}',
    '      player={chrome.player}',
    '      sheet={',
    '        tab === undefined ? undefined : (',
    '          <InPanel.Provider value={true}>',
    '            <Player tab={tab} closes={!chrome.sheetOpen} />',
    '          </InPanel.Provider>',
    '        )',
    '      }',
    '      sheetOpen={tab !== undefined}',
    "      sheetLayer={PANEL_OVER[layout] ? 'over' : 'front'}",
    '      onSheetDismiss={go.closePanel}',
    '      appBar={chrome.appBar}',
    '      column={chrome.column}',
    '      scrollKey={where}',
    '      platform={platform}',
    '    >',
    '      {Over === undefined ? outlet : <Over />}',
    '    </BackdropShell>',
    '  );',
    '}',
    '',
  ].join('\n');
}
/**
 * `stacks.ts`: what the web's navigation stacks (`web/src/shell-nav.ts`) need of nav.json: each
 * destination's home, the pages at the rail's foot (`foot`, from shell.json), each player tab's
 * sheet, and each web page's path, the destination it lights, whether it is a sheet and whether a
 * stack keeps it: not the page for a link to nothing, nor a bare page before the app (sign-in,
 * setup), none of them ever returned to.
 */
export function generateNavMap(nav: Nav, foot: string[]): string {
  const pages = nav.pages.filter((p) => p.platforms.includes('web'));
  const path = (id: string) => {
    const page = pages.find((p) => p.id === id);
    if (page === undefined) throw new Error(`${id} is not a web page`);
    return splitRoute(page.route).path;
  };
  const table = (ids: [string, string][]) =>
    JSON.stringify(Object.fromEntries(ids.map(([key, id]) => [key, path(id)])), null, 2)
      .split('\n')
      .join('\n  ');
  const tabs = Object.entries(PLAYER_TABS)
    .filter(([id]) => pages.some((p) => p.id === id))
    .map(([id, tab]): [string, string] => [tab, id]);
  return [
    `// ${APP_NOTE}`,
    "import type { NavMap } from '../../shell-nav';",
    '',
    'export const NAV_MAP: NavMap = {',
    `  homes: ${table(nav.destinations.map((d) => [d.id, d.id]))},`,
    `  foot: ${table(foot.map((id) => [id, id]))},`,
    `  tabs: ${table(tabs)},`,
    '  pages: [',
    ...pages.map(
      (p) =>
        `    { path: ${literal(splitRoute(p.route).path)}, lights: ${literal(p.lights)}, ` +
        `sheet: ${p.presentation === 'sheet'}, kept: ${p.route !== '*' && p.presentation !== 'bare'} },`,
    ),
    '  ],',
    '};',
    '',
  ].join('\n');
}

/**
 * `platform.ts`: which of nav.json's layouts the window width calls for, as a hook, each layout's
 * density and whether its side panel holds the player, and the shape of the frame each generated
 * page hands the shell: the shell's parts at each layout, its back layer and its subheader. The
 * phone's density holds in the bottom bar's layout; every rail draws at desktop density.
 */
export function generatePlatform(nav: Nav): string {
  const [first, ...rest] = nav.layouts;
  if (first === undefined) throw new Error('nav.json has no layouts');
  const id = (l: { minWidth: number }) => `'w${l.minWidth}'`;
  const widest = nav.layouts[nav.layouts.length - 1]!;
  return [
    `// ${APP_NOTE}`,
    "import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';",
    "import type { ShellNav } from '../../shell-nav';",
    '',
    "export type Platform = 'mobile' | 'desktop';",
    '',
    '/** A layout of nav.json, named by its minimum width. */',
    `export type LayoutId = ${nav.layouts.map(id).join(' | ')};`,
    '',
    "/** The shell's parts at one layout: its rail, what leads the heading, the player bar, and whether the side panel opens. */",
    'export interface Chrome {',
    '  /** A top app bar in place of the backdrop: a page that is not a destination, on the phone. */',
    '  appBar: boolean;',
    '  rail?: ReactNode;',
    '  leading?: ReactNode;',
    '  player?: ReactNode;',
    "  /** Whether the layout opens the side panel's player, at Now Playing, of its own. */",
    '  sheetOpen: boolean;',
    "  /** A bare page's one centred column, its reading width. */",
    "  column?: 'form';",
    '}',
    '',
    "/** Each layout's density. */",
    'export const PLATFORM: Record<LayoutId, Platform> = {',
    ...nav.layouts.map((l) => `  ${layoutId(l)}: '${platformOf(l)}',`),
    '};',
    '',
    '/** Whether each layout holds the player in the side panel, beside the page it is drawn over, or as a full-screen sheet. */',
    'export const PANEL: Record<LayoutId, boolean> = {',
    ...nav.layouts.map((l) => `  ${layoutId(l)}: ${holdsPanel(l)},`),
    '};',
    '',
    "/** Whether each layout's side panel opens over the page, a modal side sheet, rather than beside it. */",
    'export const PANEL_OVER: Record<LayoutId, boolean> = {',
    ...nav.layouts.map((l) => `  ${layoutId(l)}: ${panelOver(l)},`),
    '};',
    '',
    "/** What a page's back layer and subheader are drawn with, from the shell. */",
    'export interface FrameContext {',
    '  platform: Platform;',
    '  leading?: ReactNode;',
    '}',
    '',
    "/** What a page hands the shell: its placeholder, the shell's parts at each layout, its back layer and its subheader. */",
    'export interface PageFrame<Data> {',
    '  placeholder: Data;',
    '  chrome: Record<LayoutId, (go: ShellNav) => Chrome>;',
    '  back(data: Data, context: FrameContext): ReactNode;',
    '  subheader?(data: Data, context: FrameContext): ReactNode;',
    '}',
    '',
    '/** Each layout past the first, with the media query that reaches it, narrowest first. */',
    'const WIDER: readonly (readonly [LayoutId, string])[] = [',
    ...rest.map((l) => `  [${id(l)}, '(min-width: ${l.minWidth}px)'],`),
    '];',
    '',
    'function current(): LayoutId {',
    `  let layout: LayoutId = ${id(first)};`,
    '  for (const [wider, query] of WIDER) if (window.matchMedia(query).matches) layout = wider;',
    '  return layout;',
    '}',
    '',
    'function subscribe(onChange: () => void): () => void {',
    '  const queries = WIDER.map(([, query]) => window.matchMedia(query));',
    "  for (const query of queries) query.addEventListener('change', onChange);",
    "  return () => queries.forEach((query) => query.removeEventListener('change', onChange));",
    '}',
    '',
    "/** A layout to draw in, given in place of the window's, as a still of the app at one width is. */",
    'export const GivenLayout = createContext<LayoutId | undefined>(undefined);',
    '',
    '/** The layout given, or else the one the window width calls for; the widest when there is no window. */',
    'export function useLayout(): LayoutId {',
    '  const given = useContext(GivenLayout);',
    `  const detected = useSyncExternalStore<LayoutId>(subscribe, current, () => ${id(widest)});`,
    '  return given ?? detected;',
    '}',
    '',
  ].join('\n');
}
