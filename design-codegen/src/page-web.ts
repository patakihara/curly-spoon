/**
 * A page tree as a web page: `web/src/generated/pages/<Id>.tsx`, a React component calling the web
 * UI package's Sonora components for the page's content, with its placeholder as its default data.
 * The page exports its `frame` for the one shell around every page (`nav/Shell.tsx`): the shell's
 * parts for every layout, the window's width picking one, and its back layer and subheader. A
 * player sheet is its tab's page alone: the shell's one player draws it, beside the page it is
 * drawn over or full screen, and the side panel too, so a tab switch never redraws the player.
 * What is loaded, `shell.playing` on the canvas, is the web player's (`web/src/player`):
 * `usePlaying()` in a page, the `playing` the shell hands each layout's parts, the mini-player
 * drawn only once something is loaded. A `<Play>` plays through `usePlay()`, and a `<Query />` is
 * the search draft's `useQuery()` (`web/src/query`); a back layer or subheader holding one, or an
 * `<Open>` and so the router's `useNavigate()`, is drawn as a component of its own, since the
 * shell calls the frame's parts outside any page.
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
  /** Each page's query names, from its route: `q` for `/search?q`. */
  queries: Map<string, string[]>;
  wired: Map<PageTree, Record<string, string>>;
  /** The shell's elements showing what is loaded, drawn only once something is. */
  loaded: Set<PageTree>;
  /** Elements drawn only while a condition holds, as its code. */
  gated: Map<PageTree, string>;
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

/** Whether an element plays each item on the queue its data names. */
const playsBound = (node: PageTree) =>
  node.kind === 'element' &&
  Object.values(node.props).some((v) => v.kind === 'play' && typeof v.queue !== 'string');

/** Whether an element holds the search query, a `<Query />` in one of its handler props. */
const queries = (node: PageTree) =>
  node.kind === 'element' && Object.values(node.props).some((v) => v.kind === 'query');

/** The draft's handler each prop a `<Query />` goes on takes: typing, and submitting. */
const QUERY_HANDLERS: Readonly<Record<string, string>> = {
  onChange: 'query.type',
  onSubmit: 'query.submit',
};

/**
 * An Open's bound values, split into its page's route parameters and its query names: a page
 * bound from data takes its route parameters alone.
 */
function openParams(
  value: Extract<PropValue, { kind: 'open' }>,
  queryNames: Map<string, string[]>,
) {
  const names = typeof value.page === 'string' ? (queryNames.get(value.page) ?? []) : [];
  const entries = Object.entries(value.params);
  return {
    path: entries.filter(([k]) => !names.includes(k)),
    query: entries.filter(([k]) => names.includes(k)),
  };
}

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
    const bound = openParams(value, components.queries);
    const spelled = (entries: [string, string[]][]) =>
      entries.map(([k, path]) => `${k}: ${path.join('.')}`).join(', ');
    // A page bound to the item's data looks its route up among the pages this page may open.
    const path =
      typeof value.page === 'string'
        ? `'${components.paths.get(value.page)!}'`
        : `routes[${value.page.path.join('.')}]!`;
    let to = bound.path.length === 0 ? path : `generatePath(${path}, { ${spelled(bound.path)} })`;
    // The route's query names it binds follow as a search string, `/search?q=salt+road`.
    if (bound.query.length > 0) to += ` + '?' + new URLSearchParams({ ${spelled(bound.query)} })`;
    if (Object.keys(value.params).length === 0) return [`${name}={() => navigate(${to})}`];
    // A link whose ref is empty has no page to open: the prop is left undefined, so Sonora draws
    // it as plain text, never a link to an empty or Not found page.
    const given = Object.values(value.params)
      .map((p) => p.join('.'))
      .join(' && ');
    return [`${name}={${given} ? () => navigate(${to}) : undefined}`];
  }
  // A Play plays its item through the web's player, now, next or as a list on its own: the
  // player hands the handler, or none while it cannot play, so the control draws disabled.
  if (value.kind === 'play') {
    const ref = value.params['ref'];
    if (ref === undefined) throw new Error(`${owner}.${name}: Play needs ref={…}`);
    const mode = value.next ? 'next' : value.source ? 'source' : 'now';
    // A queue bound from data is one the check has already held to the player's queues.
    const queue =
      typeof value.queue === 'string'
        ? `'${value.queue}'`
        : `${pathCode(value.queue.path)} as PlayQueue`;
    return [`${name}={play(${pathCode(ref)}, ${queue}, '${mode}')}`];
  }
  // The search draft types on a field's onChange and runs the search on its onSubmit.
  if (value.kind === 'query') {
    const handler = QUERY_HANDLERS[name];
    if (handler === undefined)
      throw new Error(`${owner}.${name}: Query goes on onChange or onSubmit`);
    return [`${name}={${handler}}`];
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
      const gate = components.gated.get(tree);
      if (gate !== undefined) {
        components.gated.delete(tree);
        const lines = render(tree, inner, components);
        components.gated.set(tree, gate);
        return [`${indent}{${gate} && (`, ...lines, `${indent})}`];
      }
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

/** The names a frame part's code uses: the page's data, and what the shell draws it with. */
function partUses(lines: string[]) {
  const code = lines.join('\n');
  const uses = (word: string) => new RegExp(`\\b${word}\\b`).test(code);
  return { data: uses('data'), context: CONTEXT.filter(uses) };
}

/**
 * One of the frame's parts, `back` or `subheader`, as a function of the page's data and what the
 * shell draws it with, taking only the names its code uses.
 */
function framePart(name: string, lines: string[]): string[] {
  const { data, context } = partUses(lines);
  const args = context.length > 0 ? `data, { ${context.join(', ')} }` : data ? 'data' : '';
  if (lines.length === 1) return [`  ${name}: (${args}) => ${lines[0]!.trim()},`];
  return [`  ${name}: (${args}) => (`, ...lines, '  ),'];
}

/**
 * A frame part calling hooks, `hooks`, the router's to open a page or the search draft's, as a
 * component of its own, `<Page>Back`: the shell calls the frame's parts as plain functions,
 * outside any page, where no hook may run. Its declaration, and the frame's entry drawing it.
 */
function framePartComponent(
  name: string,
  component: string,
  dataType: string,
  hooks: string[],
  lines: string[],
): { declaration: string[]; entry: string[] } {
  const { data, context } = partUses(lines);
  const props = [
    ...(data ? ['data'] : []),
    ...(context.length > 0 ? [`context: { ${context.join(', ')} }`] : []),
  ];
  const types = [
    ...(data ? [`data: ${dataType}`] : []),
    ...(context.length > 0 ? ['context: FrameContext'] : []),
  ];
  const signature = props.length === 0 ? '' : `{ ${props.join(', ')} }: { ${types.join('; ')} }`;
  const args = context.length > 0 ? `${data ? 'data' : '_data'}, context` : data ? 'data' : '';
  const given = [
    ...(data ? ['data={data}'] : []),
    ...(context.length > 0 ? ['context={context}'] : []),
  ];
  return {
    declaration: [
      `/** The page's ${name === 'back' ? 'back layer' : 'subheader'}, a component of its own since it calls hooks: the shell calls the frame's parts as plain functions, where no hook may run. */`,
      `function ${component}(${signature}) {`,
      ...hooks.map((hook) => `  ${hook}`),
      '  return (',
      ...lines,
      '  );',
      '}',
      '',
    ],
    entry: [`  ${name}: (${args}) => <${component}${given.map((g) => ' ' + g).join('')} />,`],
  };
}

/**
 * A play button labelled Resume on a header that binds the item's progress says Resume only while
 * there is some, and Play on an item not begun: the canvas draws an item part way through.
 */
function resumes(root: PageTree, wired: Map<PageTree, Record<string, string>>) {
  some(root, (n) => {
    if (n.kind !== 'element') return false;
    const { playLabel, progress } = n.props;
    if (
      playLabel?.kind === 'literal' &&
      playLabel.value === 'Resume' &&
      progress?.kind === 'binding'
    ) {
      const at = pathCode(progress.path);
      wired.set(n, { ...wired.get(n), playLabel: `${at} ? 'Resume' : 'Play'` });
    }
    return false;
  });
}

/** The value at a bound data path in the placeholder. */
const valueAt = (placeholder: unknown, path: string[]): unknown =>
  path[0] !== 'data'
    ? undefined
    : path
        .slice(1)
        .reduce<unknown>(
          (at, key) =>
            at !== null && typeof at === 'object'
              ? (at as Record<string, unknown>)[key]
              : undefined,
          placeholder,
        );

/**
 * A page whose subheader's section bar (`spy`) binds its titles from the data draws each titled
 * section the bar's placeholder names only while the data names it too: the data says which of
 * its sections the page has, as the bar names them. A section the bar never names always draws.
 */
function barred(
  root: PageTree,
  subheader: PageTree,
  placeholder: unknown,
  gated: Map<PageTree, string>,
) {
  let bar: string[] | undefined;
  some(subheader, (n) => {
    if (n.kind !== 'element' || n.props.spy === undefined) return false;
    const sections = n.props.sections;
    if (sections?.kind !== 'binding') return false;
    const named = valueAt(placeholder, sections.path);
    if (Array.isArray(named)) bar = sections.path;
    return bar !== undefined;
  });
  if (bar === undefined) return;
  const names = new Set(valueAt(placeholder, bar) as unknown[]);
  some(root, (n) => {
    if (n.kind !== 'element' || n.component !== 'Section') return false;
    const title = n.props.title;
    if (title?.kind === 'literal' && typeof title.value === 'string' && names.has(title.value)) {
      gated.set(
        n,
        `${pathCode(bar!)}.includes(${JSON.stringify(title.value).replaceAll('"', "'")})`,
      );
    }
    return false;
  });
}

export function generateWebPage(
  tree: PageTree,
  id: string,
  placeholder: unknown,
  webComponents: WebComponents,
  { nav, shell, page }: WebShell,
): string {
  const paths = new Map(nav.pages.map((p) => [p.id, splitRoute(p.route).path]));
  const components: Ctx = {
    ...webComponents,
    paths,
    queries: new Map(nav.pages.map((p) => [p.id, splitRoute(p.route).query])),
    wired: new Map(),
    loaded: new Set(),
    gated: new Map(),
  };
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
  resumes(root, components.wired);
  if (subheader !== undefined) barred(root, subheader, placeholder, components.gated);
  const body = render(root, '    ', components);
  const own = [root, back, subheader].filter((t): t is PageTree => t !== undefined);
  const inPage = (test: (node: PageTree) => boolean) => own.some((t) => some(t, test));
  const usesPlay = inPage(plays);
  const usesPlaying = inPage((n) => showsLoaded(n) || transport.has(n));
  const fromPlayer = [
    ...(usesPlay ? ['usePlay'] : []),
    ...(usesPlaying ? ['usePlaying'] : []),
    ...(inPage(playsBound) ? ['type PlayQueue'] : []),
    ...(sheet ? [] : ['type Playing']),
  ];
  const usesQuery = inPage(queries);
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
  const opens = inPage(opening);
  const bound = inPage(
    (n) =>
      n.kind === 'element' &&
      Object.values(n.props).some(
        (v) => v.kind === 'open' && openParams(v, components.queries).path.length > 0,
      ),
  );
  const routed = inPage(
    (n) =>
      n.kind === 'element' &&
      Object.values(n.props).some((v) => v.kind === 'open' && typeof v.page !== 'string'),
  );
  const router = [...(bound ? ['generatePath'] : []), ...(opens ? ['useNavigate'] : [])];
  if (router.length > 0) react.push(`import { ${router.join(', ')} } from 'react-router';`);
  // The back layer and subheader, each a function of the data, or a component of its own where it
  // calls a hook: the router's, to open a page, or the search draft's.
  const frameParts = (sheet ? [] : [['back', back!] as const, ['subheader', subheader] as const])
    .filter((entry): entry is readonly ['back' | 'subheader', PageTree] => entry[1] !== undefined)
    .map(([part, tree]) => {
      const lines = render(tree, '    ', components);
      const hooks = [
        ...(some(tree, opening) ? ['const navigate = useNavigate();'] : []),
        ...(some(tree, queries) ? ['const query = useQuery();'] : []),
      ];
      if (hooks.length === 0) return { declaration: [], entry: framePart(part, lines) };
      const component = `${name}${part === 'back' ? 'Back' : 'Subheader'}`;
      return framePartComponent(part, component, `${name}Data`, hooks, lines);
    });
  const takesContext = frameParts.some((p) => p.declaration.join('\n').includes('FrameContext'));
  return [
    `// ${APP_NOTE}`,
    ...react,
    sheet
      ? "import { PANEL, useLayout, type Platform } from '../nav/platform';"
      : `import { PLATFORM, useLayout, type Chrome, ${takesContext ? 'type FrameContext, ' : ''}type LayoutId, type PageFrame } from '../nav/platform';`,
    ...(sheet
      ? [`import { InPanel${goes ? ', useShellNav' : ''} } from '../../shell-nav';`]
      : ["import type { ShellNav } from '../../shell-nav';"]),
    ...(fromPlayer.length === 0
      ? []
      : fromPlayer.every((name) => name.startsWith('type '))
        ? [`import type { ${fromPlayer.map((n) => n.slice(5)).join(', ')} } from '../../player';`]
        : [`import { ${fromPlayer.join(', ')} } from '../../player';`]),
    ...(usesQuery ? ["import { useQuery } from '../../query';"] : []),
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
    ...frameParts.flatMap((p) => p.declaration),
    ...(sheet
      ? []
      : [
          '/** What the page hands the one shell around every page: its parts at each layout, its back layer and its subheader. */',
          `export const frame: PageFrame<${name}Data> = {`,
          '  placeholder,',
          '  chrome: CHROME,',
          ...frameParts.flatMap((p) => p.entry),
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
    ...(some(root, opening) ? ['  const navigate = useNavigate();'] : []),
    ...(sheet && goes ? ['  const go = useShellNav();'] : []),
    ...(usesPlay ? ['  const play = usePlay();'] : []),
    ...(some(root, queries) ? ['  const query = useQuery();'] : []),
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
