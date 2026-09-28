/**
 * A page tree as a web page: `web/src/generated/pages/<Id>.tsx`, a React component calling the web
 * UI package's Sonora components inside the app shell, with the page's placeholder as its default
 * data. The shell's parts for every layout are constants of the page; the window's width picks one.
 */
import { componentName, splitRoute, type Nav, type NavPage } from './nav.js';
import { APP_NOTE } from './outputs.js';
import type { Choices, PageTree, PropValue } from './page.js';
import {
  chrome,
  framePage,
  framed,
  holdsPanel,
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
  /** The components that take an `onChange` handler. */
  handled: Set<string>;
  /**
   * Each component's props that take one of a fixed set of words (`tone`, `size`). A placeholder's
   * JSON reads as a plain string, so a bound value for one is read as the prop's own type; the
   * canvas check has already refused any value that is not one of its words.
   */
  choices?: Choices;
}

/** What rendering needs beyond the components: each page's route path, for an `<Open>`. */
type Ctx = WebComponents & { paths: Map<string, string> };

const chosen = (tree: PageTree, name: string, components: WebComponents) =>
  tree.kind === 'element' && components.choices?.get(tree.component)?.has(name) === true;

/** The shell a page is generated into: the navigation map, shell.json and the page's own entry. */
export interface WebShell {
  nav: Nav;
  shell: ShellFile;
  page: NavPage;
  /** Now Playing's page, which the side panel shows on every page. */
  now?: PageTree[];
}

/** A page is a still: a field it shows a value in gets a handler that ignores changes. */
const ignored = (tree: PageTree, components: WebComponents) =>
  tree.kind === 'element' &&
  components.handled.has(tree.component) &&
  ('value' in tree.props || 'checked' in tree.props) &&
  !('onChange' in tree.props);

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
  // No request endpoint exists yet: the card answers a tap by saying Requested on its own.
  if (value.kind === 'request') return [`${name}={ignore}`];
  // No player exists yet either: a play does nothing until the player is built.
  if (value.kind === 'play') return [`${name}={ignore}`];
  if (value.kind === 'binding' && choice) {
    return [
      `${name}={${value.path.join('.')} as Exclude<ComponentProps<typeof ${owner}>['${name}'], undefined>}`,
    ];
  }
  if (value.kind === 'binding') return [`${name}={${value.path.join('.')}}`];
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
      return [`${indent}{${tree.path.join('.')}}`];
    case 'fragment':
      return [`${indent}<>`, ...kids(tree.children, inner), `${indent}</>`];
    case 'each':
      return [
        `${indent}{${tree.of.join('.')}.map((${tree.as}, i) => (`,
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
      const props = Object.entries(tree.props).map(([name, value]) =>
        propLines(name, value, inner, components, tree.component, chosen(tree, name, components)),
      );
      if (ignored(tree, components)) props.push(['onChange={ignore}']);
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

function chromeEntry(parts: Chrome, components: Ctx): string[] {
  const out = [`    platform: '${parts.platform}',`, `    appBar: ${parts.appBar},`];
  for (const key of ['rail', 'leading', 'player', 'sheet'] as const) {
    const tree = parts[key];
    if (tree === undefined) continue;
    out.push(`    ${key}: (`, ...render(tree, '      ', components), '    ),');
  }
  out.push(`    sheetOpen: ${parts.sheetOpen},`);
  if (parts.column !== undefined) out.push(`    column: '${parts.column}',`);
  return out;
}

const binding = (path: string): PropValue => ({ kind: 'binding', path: path.split('.') });

export function generateWebPage(
  tree: PageTree,
  id: string,
  placeholder: unknown,
  webComponents: WebComponents,
  { nav, shell, page, now = [] }: WebShell,
): string {
  const components: Ctx = {
    ...webComponents,
    paths: new Map(nav.pages.map((p) => [p.id, splitRoute(p.route).path])),
  };
  const sheet = page.presentation === 'sheet';
  const root = sheet
    ? playerTree(playerTab(page), framePage(tree).content)
    : framed(framePage(tree), page.title, {
        rail: binding('chrome.rail'),
        leading: binding('chrome.leading'),
        player: binding('chrome.player'),
        sheet: binding('panel'),
        sheetOpen: binding('chrome.sheetOpen'),
        appBar: binding('chrome.appBar'),
        ...(page.presentation === 'bare' ? { column: binding('chrome.column') } : {}),
      });
  const chromes = sheet
    ? []
    : nav.layouts.map(
        (layout) =>
          [layoutId(layout), chrome(nav, shell, page, layout, components.platformed, now)] as const,
      );
  const used = new Set<string>();
  drawn(root, used);
  for (const [, parts] of chromes) {
    for (const key of ['rail', 'leading', 'player', 'sheet'] as const) drawn(parts[key], used);
  }
  // A page named as a component it draws with, Now Playing's NowPlaying, takes a suffix.
  const name = used.has(componentName(id)) ? `${componentName(id)}Screen` : componentName(id);
  const over = sheet ? componentName(shell.sheetOver!) : undefined;
  const react = some(root, (n) => n.kind === 'each') ? ["import { Fragment } from 'react';"] : [];
  const typed = [
    root,
    ...chromes.flatMap(([, parts]) => [parts.rail, parts.leading, parts.player, parts.sheet]),
  ].some(
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
  const opens = some(
    root,
    (n) => n.kind === 'element' && Object.values(n.props).some((v) => v.kind === 'open'),
  );
  const bound = some(
    root,
    (n) =>
      n.kind === 'element' &&
      Object.values(n.props).some((v) => v.kind === 'open' && Object.keys(v.params).length > 0),
  );
  const routed = some(
    root,
    (n) =>
      n.kind === 'element' &&
      Object.values(n.props).some((v) => v.kind === 'open' && typeof v.page !== 'string'),
  );
  if (opens) {
    const names = bound ? 'generatePath, useNavigate' : 'useNavigate';
    react.push(`import { ${names} } from 'react-router';`);
  }
  if (!sheet) react.push("import type { ReactNode } from 'react';");
  return [
    `// ${APP_NOTE}`,
    ...react,
    sheet
      ? "import { useLayout, type LayoutId, type Platform } from '../nav/platform';"
      : "import { useLayout, type Chrome, type LayoutId } from '../nav/platform';",
    `import { ${[...used].sort().join(', ')} } from '../ui/index.js';`,
    ...(over === undefined ? [] : [`import ${over} from './${over}';`]),
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
    `const shell = ${JSON.stringify(shellData(nav, shell), null, 2)};`,
    '',
    ...(sheet
      ? [
          '/** Whether each layout holds the player in the side panel, beside the page it is drawn over, or as a full-screen sheet. */',
          'const PANEL: Record<LayoutId, boolean> = {',
          ...nav.layouts.map((layout) => `  ${layoutId(layout)}: ${holdsPanel(layout)},`),
          '};',
        ]
      : [
          '/** The shell’s parts at each layout, from nav.json. */',
          'const CHROME: Record<LayoutId, Chrome> = {',
          ...chromes.flatMap(([layout, parts]) => [
            `  ${layout}: {`,
            ...chromeEntry(parts, components),
            '  },',
          ]),
          '};',
        ]),
    '',
    ...(some(
      root,
      (n) =>
        ignored(n, components) ||
        (n.kind === 'element' &&
          Object.values(n.props).some((v) => v.kind === 'request' || v.kind === 'play')),
    )
      ? ['const ignore = () => {};', '']
      : []),
    `export type ${name}Data = typeof placeholder;`,
    '',
    `export interface ${name}Props {`,
    `  data?: ${name}Data;`,
    '  /** Which of the placeholder states to show: M0 draws only `full`. */',
    '  state?: string;',
    '  /** The layout to draw in; by default, the one the window width calls for. */',
    '  layout?: LayoutId;',
    ...(sheet
      ? []
      : [
          '  /** A player sheet drawn over this page, as its side panel in place of the shell’s. */',
          '  sheet?: ReactNode;',
        ]),
    '}',
    '',
    ...(sheet
      ? [
          `export default function ${name}({ data = placeholder, state = 'full', layout: given }: ${name}Props) {`,
          '  const detected = useLayout();',
          '  const layout = given ?? detected;',
          "  const platform: Platform = PANEL[layout] ? 'desktop' : 'mobile';",
          ...(opens ? ['  const navigate = useNavigate();'] : []),
          '  const player = (',
          ...render(root, '    ', components),
          '  );',
          `  return PANEL[layout] ? <${over} layout={layout} sheet={player} /> : player;`,
          '}',
        ]
      : [
          `export default function ${name}({ data = placeholder, state = 'full', layout: given, sheet }: ${name}Props) {`,
          '  const detected = useLayout();',
          '  const chrome = CHROME[given ?? detected];',
          '  const platform = chrome.platform;',
          '  const panel = sheet ?? chrome.sheet;',
          ...(opens ? ['  const navigate = useNavigate();'] : []),
          '  return (',
          ...render(root, '    ', components),
          '  );',
          '}',
        ]),
    '',
  ].join('\n');
}
