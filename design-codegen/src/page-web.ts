/**
 * A page tree as a web page: `web/src/generated/pages/<Id>.tsx`, a React component calling the web
 * UI package's Sonora components for the page's content, with its placeholder as its default data.
 * The page exports its `frame` for the one shell around every page (`nav/Shell.tsx`): the shell's
 * parts for every layout, the window's width picking one, and its back layer and subheader. A
 * player sheet is its tab's page alone: the shell's one player draws it, beside the page it is
 * drawn over or full screen, and the side panel too, so a tab switch never redraws the player.
 * What is loaded, `shell.playing` on the canvas, is the web player's (`web/src/player`):
 * `usePlaying()` in a page, the `playing` the shell hands each layout's parts, the mini-player
 * drawn only once something is loaded. A `<Play>` plays through `usePlay()`.
 */
import { LoginQuery, login } from '@auralis/schema';
import { componentName, splitRoute, type Nav, type NavPage } from './nav.js';
import { APP_NOTE } from './outputs.js';
import type { Choices, PageTree, PropValue } from './page.js';
import { shellHandlers, type ShellAction, type ShellHandlers } from './shell-handlers.js';
import {
  chrome,
  framePage,
  framed,
  layoutId,
  playerTab,
  playerTree,
  shellData,
  type Chrome,
  type ShellFile,
} from './shell.js';

function drawn(tree: PageTree | undefined, into: Set<string>): Set<string> {
  if (tree === undefined) return into;
  if (tree.kind === 'element') {
    into.add(tree.component);
    for (const value of Object.values(tree.props))
      if (value.kind === 'slot') drawn(value.tree, into);
  }
  if ('children' in tree) tree.children.forEach((child) => drawn(child, into));
  return into;
}

function some(tree: PageTree, test: (node: PageTree) => boolean): boolean {
  if (test(tree)) return true;
  if (tree.kind === 'element') {
    for (const value of Object.values(tree.props)) {
      if (value.kind === 'slot' && some(value.tree, test)) return true;
    }
  }
  return 'children' in tree && tree.children.some((c) => some(c, test));
}

/** What the generator needs to know of the Sonora components a page uses. */
export interface WebComponents {
  /** The components that take a `platform` prop; each gets the page's own. */
  platformed: Set<string>;
  /**
   * Each component's props that take one of a fixed set of words (`tone`, `size`). A placeholder's
   * JSON reads as a plain string, so a bound value for one is read as the prop's own type; the
   * canvas check has already refused any value that is not one of its words.
   */
  choices?: Choices;
}

/**
 * What rendering needs beyond the components: each page's route path, for an `<Open>`, and the
 * shell's handlers on its own elements, as the code each handler prop is given.
 */
type Ctx = WebComponents & {
  paths: Map<string, string>;
  wired: Map<PageTree, Record<string, string>>;
  /** The shell's elements showing what is loaded, drawn only once something is. */
  loaded: Set<PageTree>;
};

/** Whether a bound path is what is loaded, shell.json's `playing`, which the web's player holds. */
const isLoaded = (path: string[]) => path[0] === 'shell' && path[1] === 'playing';

/** A bound path as web code: what is loaded is the player's `playing`, the rest as written. */
const pathCode = (path: string[]) =>
  (isLoaded(path) ? ['playing', ...path.slice(2)] : path).join('.');

/** Whether a node shows what is loaded, in a prop, a child or a list. */
const showsLoaded = (node: PageTree) =>
  node.kind === 'binding'
    ? isLoaded(node.path)
    : node.kind === 'each'
      ? isLoaded(node.of)
      : node.kind === 'element' &&
        Object.values(node.props).some((v) => v.kind === 'binding' && isLoaded(v.path));

/** Whether an element plays an item, a `<Play>` in one of its handler props. */
const plays = (node: PageTree) =>
  node.kind === 'element' && Object.values(node.props).some((v) => v.kind === 'play');

/**
 * Each of the shell's actions on the handler prop `prop`, as the web code doing it through
 * `useShellNav`'s `go`, by prop: the rail's toggle also has the shell hold its `expanded`, and the
 * mini-player's Queue and Lyrics have it say whether the panel shows their tab.
 */
function spell(prop: string, action: ShellAction, paths: Map<string, string>) {
  switch (action.kind) {
    case 'close':
      return { [prop]: `() => go.close('${action.home}')` };
    case 'destination':
      return { [prop]: '(key) => go.destination(key)' };
    case 'open':
      return { [prop]: `() => go.open('${paths.get(action.page)!}')` };
    case 'tab':
      return { [prop]: '(tab) => go.tab(tab)' };
    case 'lit':
      return { [prop]: `go.lit('${action.fallback}')` };
    case 'rail':
      return {
        expanded: `go.rail(${action.expanded})`,
        [prop]: `() => go.toggleRail(${action.expanded})`,
      };
    case 'panel':
      return {
        [`${action.tab}Open`]: `go.panel() === '${action.tab}'`,
        [prop]: `() => go.togglePanel('${action.tab}')`,
      };
    case 'player':
      return {
        ...(prop === 'onTogglePlay' ? { playing: 'playing.playing' } : {}),
        ...(prop === 'onSpeed' ? { speed: 'playing.speed' } : {}),
        [prop]: `playing.${prop}`,
      };
  }
}

const chosen = (tree: PageTree, name: string, components: WebComponents) =>
  tree.kind === 'element' && components.choices?.get(tree.component)?.has(name) === true;

/** The shell a page is generated into: the navigation map, shell.json and the page's own entry. */
export interface WebShell {
  nav: Nav;
  shell: ShellFile;
  page: NavPage;
}

/**
 * Where the web starts signing in: the server's login route, as the web client, coming back to
 * where the visitor was going, the sign-in page's own `return_to`, or else the app's start. The
 * query is parsed with the route's own schema, so it names only what it takes.
 */
const SIGN_IN_QUERY: Record<string, string> = LoginQuery.parse({ client: 'web', return_to: '/' });
const RETURN_TO = 'return_to' satisfies keyof typeof SIGN_IN_QUERY & keyof typeof LoginQuery.shape;
const signInHandler = () => {
  const fixed = Object.entries(SIGN_IN_QUERY)
    .filter(([key]) => key !== RETURN_TO)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  const returnTo = `new URLSearchParams(window.location.search).get(${JSON.stringify(RETURN_TO)}) ?? ${JSON.stringify(SIGN_IN_QUERY[RETURN_TO])}`;
  const query = `new URLSearchParams({ ${[...fixed, `${RETURN_TO}: ${returnTo}`].join(', ')} })`;
  return `() => window.location.assign(${JSON.stringify(`${login.path}?`)} + ${query})`;
};

function propLines(
  name: string,
  value: PropValue,
  at: string,
  components: Ctx,
  owner: string,
  choice: boolean,
): string[] {
  if (value.kind === 'open') {
    const params = Object.entries(value.params).map(([k, path]) => `${k}: ${path.join('.')}`);
    // A page bound to the item's data looks its route up among the pages this page may open.
    const path =
      typeof value.page === 'string'
        ? `'${components.paths.get(value.page)!}'`
        : `routes[${value.page.path.join('.')}]!`;
    const to = params.length === 0 ? path : `generatePath(${path}, { ${params.join(', ')} })`;
    return [`${name}={() => navigate(${to})}`];
  }
  // A Play plays its item through the web's player, now, next or as a list on its own.
  if (value.kind === 'play') {
    const ref = value.params['ref'];
    if (ref === undefined) throw new Error(`${owner}.${name}: Play needs ref={…}`);
    const mode = value.next ? 'next' : value.source ? 'source' : 'now';
    return [`${name}={() => play(${pathCode(ref)}, '${value.queue}', '${mode}')}`];
  }
  // No request endpoint exists yet. A handler doing nothing would draw a dead control as
  // enabled, so the prop is left out and Sonora draws the control disabled.
  if (value.kind === 'request') return [];
  // Sign-in leaves the app for the server's route, which sends the browser on to the sign-on.
  if (value.kind === 'signIn') return [`${name}={${signInHandler()}}`];
  if (value.kind === 'binding' && choice) {
    return [
      `${name}={${pathCode(value.path)} as Exclude<ComponentProps<typeof ${owner}>['${name}'], undefined>}`,
    ];
  }
  if (value.kind === 'binding') return [`${name}={${pathCode(value.path)}}`];
  if (value.kind === 'literal') {
    return [
      typeof value.value === 'string'
        ? `${name}=${JSON.stringify(value.value)}`
        : `${name}={${JSON.stringify(value.value)}}`,
    ];
  }
  const lines = render(value.tree, at + '  ', components);
  if (lines.length === 1) return [`${name}={${lines[0]!.trim()}}`];
  return [`${name}={`, ...lines.map((l) => l.slice(at.length)), '}'];
}

function render(tree: PageTree, indent: string, components: Ctx): string[] {
  const inner = indent + '  ';
  const kids = (nodes: PageTree[], at: string) => nodes.flatMap((n) => render(n, at, components));
  switch (tree.kind) {
    case 'text':
      return [`${indent}{${JSON.stringify(tree.value)}}`];
    case 'binding':
      return [`${indent}{${pathCode(tree.path)}}`];
    case 'fragment':
      return [`${indent}<>`, ...kids(tree.children, inner), `${indent}</>`];
    case 'each':
      return [
        `${indent}{${pathCode(tree.of)}.map((${tree.as}, i) => (`,
        `${inner}<Fragment key={i}>`,
        ...kids(tree.children, inner + '  '),
        `${inner}</Fragment>`,
        `${indent}))}`,
      ];
    case 'when':
      return [
        `${indent}{state === ${JSON.stringify(tree.state).replaceAll('"', "'")} && (`,
        `${inner}<>`,
        ...kids(tree.children, inner + '  '),
        `${inner}</>`,
        `${indent})}`,
      ];
    case 'element': {
      if (components.loaded.has(tree)) {
        components.loaded.delete(tree);
        const lines = render(tree, inner, components);
        components.loaded.add(tree);
        return [`${indent}{playing !== null && (`, ...lines, `${indent})}`];
      }
      const wired = components.wired.get(tree) ?? {};
      const props = Object.entries(tree.props)
        .map(([name, value]) =>
          name in wired
            ? [`${name}={${wired[name]}}`]
            : propLines(
                name,
                value,
                inner,
                components,
                tree.component,
                chosen(tree, name, components),
              ),
        )
        .filter((lines) => lines.length > 0);
      for (const [name, code] of Object.entries(wired))
        if (!(name in tree.props)) props.push([`${name}={${code}}`]);
      if (components.platformed.has(tree.component) && !('platform' in tree.props)) {
        props.push(['platform={platform}']);
      }
      const close = (open: string[]) =>
        tree.children.length === 0
          ? [...open.slice(0, -1), `${open.at(-1)} />`]
          : [
              ...open.slice(0, -1),
              `${open.at(-1)}>`,
              ...kids(tree.children, inner),
              `${indent}</${tree.component}>`,
            ];
      const slotted = Object.values(tree.props).some((v) => v.kind === 'slot');
      if (!slotted && props.every((p) => p.length === 1)) {
        return close([`${indent}<${tree.component}${props.map((p) => ' ' + p[0]).join('')}`]);
      }
      const lines = [`${indent}<${tree.component}`, ...props.flat().map((l) => inner + l)];
      return tree.children.length === 0
        ? [...lines, `${indent}/>`]
        : [...lines, `${indent}>`, ...kids(tree.children, inner), `${indent}</${tree.component}>`];
    }
  }
}

/**
 * A layout's parts as the page hands them to the shell. The side panel's player is the shell's
 * own, so the page says only whether its layout draws it open, once something is loaded.
 */
function chromeEntry(parts: Chrome, components: Ctx): string[] {
  const out = [`    appBar: ${parts.appBar},`];
  for (const key of DRAWN) {
    const tree = parts[key];
    if (tree === undefined) continue;
    const loaded = components.loaded.delete(tree);
    out.push(
      `    ${key}: ${loaded ? 'playing === null ? undefined : ' : ''}(`,
      ...render(tree, '      ', components),
      '    ),',
    );
    if (loaded) components.loaded.add(tree);
  }
  out.push(`    sheetOpen: ${parts.sheetOpen ? 'playing !== null' : 'false'},`);
  if (parts.column !== undefined) out.push(`    column: '${parts.column}',`);
  return out;
}

/** The parts of a layout a page draws itself. */
const DRAWN = ['rail', 'leading', 'player'] as const;

const binding = (path: string): PropValue => ({ kind: 'binding', path: path.split('.') });

/** What a back layer or subheader may use of what the shell draws it with, in this order. */
const CONTEXT = ['platform', 'leading'] as const;

/**
 * One of the frame's parts, `back` or `subheader`, as a function of the page's data and what the
 * shell draws it with, taking only the names its code uses.
 */
function framePart(name: string, lines: string[]): string[] {
  const code = lines.join('\n');
  const uses = (word: string) => new RegExp(`\\b${word}\\b`).test(code);
  const context = CONTEXT.filter(uses);
  const args = context.length > 0 ? `data, { ${context.join(', ')} }` : uses('data') ? 'data' : '';
  if (lines.length === 1) return [`  ${name}: (${args}) => ${lines[0]!.trim()},`];
  return [`  ${name}: (${args}) => (`, ...lines, '  ),'];
}

export function generateWebPage(
  tree: PageTree,
  id: string,
  placeholder: unknown,
  webComponents: WebComponents,
  { nav, shell, page }: WebShell,
): string {
  const paths = new Map(nav.pages.map((p) => [p.id, splitRoute(p.route).path]));
  const components: Ctx = { ...webComponents, paths, wired: new Map(), loaded: new Set() };
  /** The elements whose transport the player does. */
  const transport = new Set<PageTree>();
  /** Whether any of the shell's navigation is wired into the page. */
  let goes = false;
  /**
   * Wires the shell's handlers, `handlers`, into the page, but for `skip`'s: whether it wired any
   * of the shell's navigation, `go`, and any of the player's transport, `playing`.
   */
  const wire = (handlers: ShellHandlers, skip?: PageTree) => {
    const uses = { go: false, playing: false };
    for (const [tree, props] of handlers) {
      if (tree === skip) continue;
      components.wired.set(
        tree,
        Object.assign({}, ...Object.entries(props).map(([p, a]) => spell(p, a, paths))),
      );
      for (const action of Object.values(props)) {
        if (action.kind === 'player') {
          uses.playing = true;
          transport.add(tree);
        } else uses.go = true;
      }
    }
    goes ||= uses.go;
    return uses;
  };
  const sheet = page.presentation === 'sheet';
  const frame = framePage(tree);
  // The page's content alone: the shell draws the frame around it, from the page's `frame`.
  const shelled = framed(frame, page.title, { leading: binding('leading') });
  const slot = (name: string) => {
    const value = shelled.kind === 'element' ? shelled.props[name] : undefined;
    return value?.kind === 'slot' ? value.tree : undefined;
  };
  const back = sheet ? undefined : slot('back');
  const subheader = sheet ? undefined : slot('subheader');
  for (const part of [back, subheader]) {
    if (part !== undefined && some(part, (n) => plays(n) || showsLoaded(n))) {
      throw new Error(
        `pages/${id}.page.jsx: the back layer and subheader are drawn by the shell, outside the page, so they can neither play nor show what is loaded`,
      );
    }
  }
  const root: PageTree =
    frame.content.length === 1 ? frame.content[0]! : { kind: 'fragment', children: frame.content };
  // A player sheet's transport is the player's; its tab's close and switch are the shell's own.
  if (sheet) {
    const player = playerTree(playerTab(page), frame.content);
    wire(shellHandlers(nav, page, { player }), player);
  }
  const chromes = sheet
    ? []
    : nav.layouts.map((layout) => {
        const parts = chrome(nav, shell, page, layout, components.platformed);
        let loaded = parts.sheetOpen;
        for (const key of DRAWN) {
          some(parts[key] ?? { kind: 'fragment', children: [] }, (n) => {
            if (n.kind === 'element' && showsLoaded(n)) {
              components.loaded.add(n);
              loaded = true;
            }
            return false;
          });
        }
        const uses = wire(shellHandlers(nav, page, { chrome: parts }));
        return [layoutId(layout), parts, { go: uses.go, playing: uses.playing || loaded }] as const;
      });
  const body = render(root, '    ', components);
  const own = [root, back, subheader].filter((t): t is PageTree => t !== undefined);
  const inPage = (test: (node: PageTree) => boolean) => own.some((t) => some(t, test));
  const usesPlay = inPage(plays);
  const usesPlaying = inPage((n) => showsLoaded(n) || transport.has(n));
  const fromPlayer = [
    ...(usesPlay ? ['usePlay'] : []),
    ...(usesPlaying ? ['usePlaying'] : []),
    ...(sheet ? [] : ['type Playing']),
  ];
  const used = new Set<string>();
  for (const t of own) drawn(t, used);
  for (const [, parts] of chromes) {
    for (const key of DRAWN) drawn(parts[key], used);
  }
  // A page named as a component it draws with, Now Playing's NowPlaying, takes a suffix.
  const name = used.has(componentName(id)) ? `${componentName(id)}Screen` : componentName(id);
  const fromReact = [
    ...(inPage((n) => n.kind === 'each') ? ['Fragment'] : []),
    ...(sheet ? ['useContext'] : []),
  ];
  const react = fromReact.length > 0 ? [`import { ${fromReact.join(', ')} } from 'react';`] : [];
  const typed = [...own, ...chromes.flatMap(([, parts]) => DRAWN.map((key) => parts[key]))].some(
    (tree) =>
      tree !== undefined &&
      some(
        tree,
        (n) =>
          n.kind === 'element' &&
          Object.entries(n.props).some(
            ([p, v]) => v.kind === 'binding' && chosen(n, p, components),
          ),
      ),
  );
  if (typed) react.push("import type { ComponentProps } from 'react';");
  const opening = (n: PageTree) =>
    n.kind === 'element' && Object.values(n.props).some((v) => v.kind === 'open');
  const opens = some(root, opening);
  const bound = inPage(
    (n) =>
      n.kind === 'element' &&
      Object.values(n.props).some((v) => v.kind === 'open' && Object.keys(v.params).length > 0),
  );
  const routed = inPage(
    (n) =>
      n.kind === 'element' &&
      Object.values(n.props).some((v) => v.kind === 'open' && typeof v.page !== 'string'),
  );
  const router = [...(bound ? ['generatePath'] : []), ...(opens ? ['useNavigate'] : [])];
  if (router.length > 0) react.push(`import { ${router.join(', ')} } from 'react-router';`);
  return [
    `// ${APP_NOTE}`,
    ...react,
    sheet
      ? "import { PANEL, useLayout, type Platform } from '../nav/platform';"
      : "import { PLATFORM, useLayout, type Chrome, type LayoutId, type PageFrame } from '../nav/platform';",
    ...(sheet
      ? [`import { InPanel${goes ? ', useShellNav' : ''} } from '../../shell-nav';`]
      : ["import type { ShellNav } from '../../shell-nav';"]),
    ...(fromPlayer.length === 0
      ? []
      : fromPlayer.every((name) => name.startsWith('type '))
        ? [`import type { ${fromPlayer.map((n) => n.slice(5)).join(', ')} } from '../../player';`]
        : [`import { ${fromPlayer.join(', ')} } from '../../player';`]),
    `import { ${[...used].sort().join(', ')} } from '../ui/index.js';`,
    '',
    `const placeholder = ${JSON.stringify(placeholder, null, 2)};`,
    '',
    ...(routed
      ? [
          '/** The route of each page this page may open: its structure links, and its own. */',
          `const routes: Record<string, string> = ${JSON.stringify(
            Object.fromEntries(
              [...(page.structure?.links ?? []), id]
                .filter((p) => components.paths.has(p))
                .map((p) => [p, components.paths.get(p)!]),
            ),
            null,
            2,
          )};`,
          '',
        ]
      : []),
    '/** What the shell shows around the page: shell.json, and each layout’s destinations in its order. */',
    `const shell = ${JSON.stringify({ ...shellData(nav, shell), playing: undefined, transport: undefined }, null, 2)};`,
    '',
    ...(sheet
      ? []
      : [
          '/** The shell’s parts at each layout, from nav.json, its controls wired to the shell’s navigation and to what the player has loaded, `playing`, null while nothing is. */',
          'const CHROME: Record<LayoutId, (go: ShellNav, playing: Playing | null) => Chrome> = {',
          ...chromes.flatMap(([layout, parts, uses]) => [
            `  ${layout}: (${uses.playing ? `${uses.go ? 'go' : '_go'}, playing` : uses.go ? 'go' : ''}) => ({`,
            ...chromeEntry(parts, components),
            '  }),',
          ]),
          '};',
          '',
        ]),
    `export type ${name}Data = typeof placeholder;`,
    '',
    ...(sheet
      ? []
      : [
          '/** What the page hands the one shell around every page: its parts at each layout, its back layer and its subheader. */',
          `export const frame: PageFrame<${name}Data> = {`,
          '  placeholder,',
          '  chrome: CHROME,',
          ...framePart('back', render(back!, '    ', components)),
          ...(subheader === undefined
            ? []
            : framePart('subheader', render(subheader, '    ', components))),
          '};',
          '',
        ]),
    `export interface ${name}Props {`,
    `  data?: ${name}Data;`,
    '  /** Which of the placeholder states to show: M0 draws only `full`. */',
    '  state?: string;',
    '}',
    '',
    `export default function ${name}({ data = placeholder, state = 'full' }: ${name}Props) {`,
    ...(sheet
      ? [
          '  const inPanel = useContext(InPanel);',
          "  const platform: Platform = inPanel || PANEL[useLayout()] ? 'desktop' : 'mobile';",
        ]
      : ['  const platform = PLATFORM[useLayout()];']),
    ...(opens ? ['  const navigate = useNavigate();'] : []),
    ...(sheet && goes ? ['  const go = useShellNav();'] : []),
    ...(usesPlay ? ['  const play = usePlay();'] : []),
    ...(usesPlaying
      ? ['  const playing = usePlaying();', '  if (playing === null) return null;']
      : []),
    '  return (',
    ...body,
    '  );',
    '}',
    '',
  ].join('\n');
}
