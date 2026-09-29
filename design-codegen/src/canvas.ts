/**
 * The Auralis canvas artifact (claude.ai Design type), drawn from design/app: first the structure
 * row (`structure.dc.html` and `flows.dc.html`, from nav.json), then every drawn page as a
 * phone and a desktop `.dc.html` artboard mounting Sonora's real components from the installed
 * copy under `project/ds/<folder>/`, a page with a local search adding a phone with it out, and `canvas.json`, the index that records which Sonora publish
 * is installed. Build output only (`pnpm canvas:build`), never committed.
 *
 * Each artboard is the page in the app shell at the layout its width gets. The page's content is
 * markup, mounted element by element. A prop that takes an element (the shell's rail, back layer,
 * player and panel, a page's filter row and subheader) has no markup form in the format, so those
 * trees travel as data and `renderVals()` builds them from the same Sonora components. The art
 * they show ships beside them under `project/art/` (`canvasArt`), referenced by relative path.
 */
import type { App } from './app.js';
import type { PageTree, PropValue } from './page.js';
import {
  chrome,
  framePage,
  framed,
  holdsPanel,
  layoutAt,
  playerTab,
  playerTree,
  shellData,
} from './shell.js';
import { generateFlows, generateStructure } from './structure.js';

/** Sonora's bundle global; its components mount as `<Ns>.<Name>`. */
export const SONORA_NAMESPACE = 'SonoraDesignSystem_6c1435';
/** The installed copy's folder under `project/ds/`: the namespace, lower-cased, as the type asks. */
export const DS_FOLDER = SONORA_NAMESPACE.toLowerCase();
/** The files of Sonora's publish an artboard loads, in load order, under `project/ds/<folder>/`. */
export const DS_FILES = [
  'tokens.json',
  'tokens.css',
  'components/bundle.css',
  'components/bundle.js',
];

/** When the canvas artifact was created; the type's marker, kept on every republish. */
export const CANVAS_CREATED_AT = '2026-09-27T14:27:33Z';

export const CANVAS_BOARDS = {
  phone: { width: 390, height: 844, label: 'phone' },
  desktop: { width: 1440, height: 900, label: 'desktop' },
} as const;
const GAP_X = 80;
const GAP_Y = 120;
/** Where the structure row's `title1` note sits, above the row's top edge. */
const NOTE_Y = -300;

/** The Sonora publish the canvas installs; `version` null only in a draft build. */
export interface SonoraInstall {
  title: string;
  artifact: string;
  version: string | null;
}

/**
 * Placeholder art: served from the web app's root as `/art/<file>`, and shipped beside the
 * artboards as `project/art/<file>`, so the published canvas shows it too. `web/public/art` holds it.
 */
export const ART_DIR = 'web/public/art';
const ART = /^\/art\/([^/]+)$/;

/** `value` with every `/art/<file>` in it made relative to the project, `art/<file>`. */
const relativeArt = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value), (_key, v: unknown) =>
    typeof v === 'string' && ART.test(v) ? v.slice(1) : v,
  ) as T;

/** The art files the drawn pages' artboards show, from their pages, placeholders and the shell. */
export function canvasArt(app: App): string[] {
  const files = new Set<string>();
  JSON.stringify([shellData(app.nav, app.shell), app.pages], (_key, v: unknown) => {
    const file = typeof v === 'string' ? ART.exec(v)?.[1] : undefined;
    if (file !== undefined) files.add(file);
    return v;
  });
  return [...files].sort();
}

const escapeAttr = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const escapeText = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Gives every component in `tree` that takes one the board's platform, slots included. */
function withPlatform(tree: PageTree, platform: string, platformed: Set<string>): PageTree {
  if (tree.kind === 'text' || tree.kind === 'binding') return tree;
  const children = tree.children.map((c) => withPlatform(c, platform, platformed));
  if (tree.kind !== 'element') return { ...tree, children };
  const props = Object.fromEntries(
    Object.entries(tree.props).map(([name, value]) => [
      name,
      value.kind === 'slot'
        ? { kind: 'slot' as const, tree: withPlatform(value.tree, platform, platformed) }
        : value,
    ]),
  );
  if (platformed.has(tree.component) && !('platform' in props)) {
    props.platform = { kind: 'literal', value: platform };
  }
  return { ...tree, props, children };
}

/** `tree` with every binding that starts at `from` starting at `to` instead, lists included. */
function rebind(tree: PageTree, from: string, to: string): PageTree {
  const path = (p: string[]) => (p[0] === from ? [to, ...p.slice(1)] : p);
  const value = (v: PropValue): PropValue => {
    if (v.kind === 'binding') return { ...v, path: path(v.path) };
    if (v.kind === 'slot') return { ...v, tree: rebind(v.tree, from, to) };
    // A handler does nothing on an artboard, so what it binds is never read.
    return v;
  };
  switch (tree.kind) {
    case 'text':
      return tree;
    case 'binding':
      return { ...tree, path: path(tree.path) };
    case 'element':
      return {
        ...tree,
        props: Object.fromEntries(Object.entries(tree.props).map(([k, v]) => [k, value(v)])),
        children: tree.children.map((c) => rebind(c, from, to)),
      };
    case 'each':
      return {
        ...tree,
        of: path(tree.of),
        children: tree.children.map((c) => rebind(c, from, to)),
      };
    default:
      return { ...tree, children: tree.children.map((c) => rebind(c, from, to)) };
  }
}

function count(placeholder: unknown, path: string[]): number {
  let at: unknown = placeholder;
  for (const key of path.slice(1)) at = (at as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(at) ? at.length : 1;
}

/**
 * An `<Each>` whose items hold elements given to props: `renderVals()` copies each item of `of`
 * with those elements built for it under `$s<slot>`, and each nested list likewise under
 * `$l<list>`, since a board's template reads values and cannot build an element per item.
 */
interface ItemList {
  of: string[];
  as: string;
  slots: number[];
  lists: number[];
}

/** What rendering a board sets aside for `renderVals()`: the slot trees and the item lists. */
interface Aside {
  slots: PageTree[];
  /** The slots built once for the board, not per item. */
  board: number[];
  lists: ItemList[];
  /** The top-level lists, built from the board's own scope. */
  roots: number[];
}

/** Whether an element given to a prop sits anywhere in `tree`. */
function holdsSlot(tree: PageTree): boolean {
  if (tree.kind === 'element' && Object.values(tree.props).some((v) => v.kind === 'slot'))
    return true;
  return 'children' in tree && tree.children.some(holdsSlot);
}

/**
 * The board's markup for `tree`, whose platform is already given. Each element given to a prop is
 * set aside in `aside.slots` and named by a hole, `back="{{slots.s0}}"`, for `renderVals()` to
 * build; inside an `<Each>` the hole reads the item's own copy, `trailing="{{book.$s3}}"`.
 */
function render(
  tree: PageTree,
  placeholder: unknown,
  aside: Aside,
  each?: { as: string; list: number },
): string {
  const kids = (nodes: PageTree[], inner = each) =>
    nodes.map((n) => render(n, placeholder, aside, inner)).join('');
  const attr = (name: string, value: PropValue): string => {
    if (value.kind === 'binding') return `${kebab(name)}="{{${value.path.join('.')}}}"`;
    // An artboard is a still that goes nowhere: an Open, a Request, a Play or a SignIn is a handler that does nothing.
    if (
      value.kind === 'open' ||
      value.kind === 'request' ||
      value.kind === 'play' ||
      value.kind === 'signIn'
    )
      return `${kebab(name)}="{{navigate}}"`;
    if (value.kind === 'slot') {
      const slot = aside.slots.push(value.tree) - 1;
      if (each === undefined) {
        aside.board.push(slot);
        return `${kebab(name)}="{{slots.s${slot}}}"`;
      }
      aside.lists[each.list]!.slots.push(slot);
      return `${kebab(name)}="{{${each.as}.$s${slot}}}"`;
    }
    if (typeof value.value === 'string') return `${kebab(name)}="${escapeAttr(value.value)}"`;
    return `${kebab(name)}="{{ ${JSON.stringify(value.value)} }}"`;
  };
  switch (tree.kind) {
    case 'text':
      return escapeText(tree.value);
    case 'binding':
      return `{{${tree.path.join('.')}}}`;
    case 'fragment':
      return kids(tree.children);
    case 'each': {
      const n = tree.of[0] === 'data' ? count(placeholder, tree.of) : 1;
      const open = (list: string) =>
        `<sc-for list="{{${list}}}" as="${tree.as}" hint-placeholder-count="${n}">\n`;
      if (!holdsSlot(tree)) return `${open(tree.of.join('.'))}${kids(tree.children)}</sc-for>\n`;
      const list = aside.lists.push({ of: tree.of, as: tree.as, slots: [], lists: [] }) - 1;
      if (each === undefined) aside.roots.push(list);
      else aside.lists[each.list]!.lists.push(list);
      const source = each === undefined ? `lists.l${list}` : `${each.as}.$l${list}`;
      return `${open(source)}${kids(tree.children, { as: tree.as, list })}</sc-for>\n`;
    }
    case 'when':
      return `<sc-if value="{{when.${tree.state}}}" hint-placeholder-val="{{ true }}">\n${kids(tree.children)}</sc-if>\n`;
    case 'element': {
      const attrs = Object.entries(tree.props).map(([name, value]) => ' ' + attr(name, value));
      const open = `<x-import component-from-global-scope="${SONORA_NAMESPACE}.${tree.component}"${attrs.join('')}>`;
      const inner = kids(tree.children);
      const block = tree.children.some((c) => c.kind !== 'text' && c.kind !== 'binding');
      return `${open}${block ? '\n' : ''}${inner}</x-import>\n`;
    }
  }
}

/**
 * `renderVals()`'s builder for the trees set aside as slots: each element from the Sonora bundle
 * it names, with bindings read from `data`, `shell` and any Each item, and the full state shown.
 */
const BUILD = `const S = window.${SONORA_NAMESPACE} || {};
const R = window.React;
const navigate = () => {};
const at = (scope, path) => path.slice(1).reduce((v, k) => (v == null ? v : v[k]), scope[path[0]]);
const build = (n, scope, key) => {
  const kids = (list, sc) => list.map((c, i) => build(c, sc, i));
  if (n.kind === 'text') return n.value;
  if (n.kind === 'binding') return at(scope, n.path);
  if (n.kind === 'fragment') return R.createElement(R.Fragment, { key }, ...kids(n.children, scope));
  if (n.kind === 'when') return n.state === 'full' ? R.createElement(R.Fragment, { key }, ...kids(n.children, scope)) : null;
  if (n.kind === 'each') {
    return R.createElement(R.Fragment, { key }, ...(at(scope, n.of) || []).map((item, i) =>
      R.createElement(R.Fragment, { key: i }, ...kids(n.children, Object.assign({}, scope, { [n.as]: item })))));
  }
  const C = S[n.component];
  if (!C) return null;
  const props = { key };
  for (const [name, v] of Object.entries(n.props)) {
    props[name] = v.kind === 'literal' ? v.value : v.kind === 'binding' ? at(scope, v.path) : v.kind === 'open' || v.kind === 'request' || v.kind === 'play' || v.kind === 'signIn' ? navigate : build(v.tree, scope);
  }
  return R.createElement(C, props, ...kids(n.children, scope));
};`;

/** A tree as the builder reads it: the same shape, without source lines. */
const bare = (tree: PageTree): unknown =>
  JSON.parse(JSON.stringify(tree, (key, value) => (key === 'line' ? undefined : value)));

/** The first menu `tree` draws, slots included, in document order: what `menus` names. */
function firstMenu(tree: PageTree, menus: Set<string>): PageTree | undefined {
  if (tree.kind === 'element') {
    if (menus.has(tree.component)) return tree;
    for (const value of Object.values(tree.props)) {
      const found = value.kind === 'slot' ? firstMenu(value.tree, menus) : undefined;
      if (found !== undefined) return found;
    }
  }
  if (!('children' in tree)) return undefined;
  for (const child of tree.children) {
    const found = firstMenu(child, menus);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** `tree` with `menu`, one of its elements, drawn open. */
function opening(tree: PageTree, menu: PageTree): PageTree {
  if (tree === menu && tree.kind === 'element')
    return { ...tree, props: { ...tree.props, open: { kind: 'literal', value: true } } };
  if (tree.kind !== 'element') {
    return 'children' in tree
      ? ({ ...tree, children: tree.children.map((c) => opening(c, menu)) } as PageTree)
      : tree;
  }
  return {
    ...tree,
    props: Object.fromEntries(
      Object.entries(tree.props).map(([name, value]) => [
        name,
        value.kind === 'slot' ? { ...value, tree: opening(value.tree, menu) } : value,
      ]),
    ),
    children: tree.children.map((c) => opening(c, menu)),
  };
}

/**
 * A page's artboard at a board's width. `searching` fixes the page's local search out, a still of
 * what scrolling brings; the apps leave it to the scroll. `menu` draws that menu of the page open,
 * a still of what tapping its button brings; the apps start every menu closed.
 */
function artboard(
  app: App,
  page: App['pages'][number],
  board: (typeof CANVAS_BOARDS)[keyof typeof CANVAS_BOARDS],
  searching = false,
  menu?: PageTree,
): string {
  const entry = app.nav.pages.find((p) => p.id === page.id);
  if (entry === undefined) throw new Error(`${page.id} is not a page in nav.json`);
  const layout = layoutAt(app.nav, board.width);
  const slot = (tree: PageTree | undefined): PropValue | undefined =>
    tree === undefined ? undefined : { kind: 'slot', tree };
  const inShell = (shown: App['pages'][number], sheet?: PageTree): PageTree => {
    const at = app.nav.pages.find((p) => p.id === shown.id)!;
    const parts = chrome(app.nav, app.shell, at, layout, app.components.platformed, app.now);
    return withPlatform(
      framed(framePage(relativeArt(shown.tree)), at.title, {
        rail: slot(parts.rail),
        leading: slot(parts.leading),
        player: slot(parts.player),
        sheet: slot(sheet ?? parts.sheet),
        sheetOpen: { kind: 'literal', value: parts.sheetOpen },
        appBar: { kind: 'literal', value: parts.appBar },
        ...(parts.column === undefined ? {} : { column: { kind: 'literal', value: parts.column } }),
        ...(searching ? { searchOpen: { kind: 'literal', value: true } } : {}),
      }),
      parts.platform,
      app.components.platformed,
    );
  };
  // A player sheet is the player alone, full screen; where the side panel holds it, it is drawn
  // over shell.json's `sheetOver` page, its own data read as `sheet.…` beside that page's.
  let tree: PageTree;
  let data = page.placeholder;
  let sheetData: unknown;
  if (entry.presentation !== 'sheet')
    tree = inShell(menu === undefined ? page : { ...page, tree: opening(page.tree, menu) });
  else {
    const player = playerTree(playerTab(entry), framePage(relativeArt(page.tree)).content);
    if (!holdsPanel(layout)) tree = withPlatform(player, 'mobile', app.components.platformed);
    else {
      const over = app.pages.find((p) => p.id === app.shell.sheetOver);
      if (over === undefined)
        throw new Error(
          `shell.json: sheetOver ${app.shell.sheetOver ?? 'is unset'}, not a drawn page`,
        );
      tree = inShell(over, rebind(player, 'data', 'sheet'));
      data = over.placeholder;
      sheetData = page.placeholder;
    }
  }
  const aside: Aside = { slots: [], board: [], lists: [], roots: [] };
  const markup = render(tree, data, aside).trimEnd();
  const json = (value: unknown) => JSON.stringify(value).replace(/<\/script/gi, '<\\/script');
  const preview = JSON.stringify({ $preview: { width: board.width, height: board.height } });
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeText(entry.title)} · ${board.label}</title>`,
    '<script src="./support.js"></script>',
    `<link rel="stylesheet" href="ds/${DS_FOLDER}/tokens.css">`,
    `<link rel="stylesheet" href="ds/${DS_FOLDER}/components/bundle.css">`,
    `<script src="ds/${DS_FOLDER}/components/bundle.js"></script>`,
    '</head>',
    '<body>',
    '<x-dc>',
    '<helmet>',
    '<style>body{margin:0}</style>',
    '</helmet>',
    `<div data-theme="dark" style="width: ${board.width}px; height: ${board.height}px; overflow: hidden; background: var(--surface-bg-alt); color: var(--surface-fg); font-family: var(--font-body)">`,
    markup,
    '</div>',
    '</x-dc>',
    `<script type="text/x-dc" data-dc-script data-props='${preview}'>`,
    'class Component extends DCLogic {',
    'renderVals() {',
    `const data = ${json(relativeArt(data))};`,
    `const shell = ${json(relativeArt(shellData(app.nav, app.shell)))};`,
    ...(sheetData === undefined ? [] : [`const sheet = ${json(relativeArt(sheetData))};`]),
    `const trees = ${json(aside.slots.map(bare))};`,
    ...(aside.lists.length === 0 ? [] : [`const itemLists = ${json(aside.lists)};`]),
    BUILD,
    sheetData === undefined
      ? 'const scope = { data, shell };'
      : 'const scope = { data, shell, sheet };',
    'const slots = {};',
    ...(aside.lists.length === 0
      ? ['trees.forEach((t, i) => { slots["s" + i] = build(t, scope); });']
      : [
          `${json(aside.board)}.forEach((i) => { slots["s" + i] = build(trees[i], scope); });`,
          'const items = (l, sc) => (at(sc, l.of) || []).map((item) => {',
          '  const inner = Object.assign({}, sc, { [l.as]: item });',
          '  const copy = Object.assign({}, item);',
          '  l.slots.forEach((i) => { copy["$s" + i] = build(trees[i], inner); });',
          '  l.lists.forEach((i) => { copy["$l" + i] = items(itemLists[i], inner); });',
          '  return copy;',
          '});',
          'const lists = {};',
          `${json(aside.roots)}.forEach((i) => { lists["l" + i] = items(itemLists[i], scope); });`,
        ]),
    `return { data, shell, slots, ${aside.lists.length === 0 ? '' : 'lists, '}when: {"full":true}, navigate };`,
    '}',
    '}',
    '</script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** Every file under the canvas's `project/` but the installed Sonora copy, by path under it. */
export function generateCanvas(app: App, sonora: SonoraInstall, now: Date): Map<string, string> {
  const files = new Map<string, string>();
  const boards: Record<string, Record<string, unknown>> = {};
  const drawn = new Set(app.pages.map((p) => p.id));
  const head = [
    `<link rel="stylesheet" href="ds/${DS_FOLDER}/tokens.css">`,
    `<link rel="stylesheet" href="ds/${DS_FOLDER}/components/bundle.css">`,
  ];
  let across = 0;
  let top = 0;
  for (const [name, title, board] of [
    ['structure.dc.html', 'Structure', generateStructure(app.nav, drawn, head)],
    ['flows.dc.html', 'Flows', generateFlows(app.nav, drawn, head)],
  ] as const) {
    files.set(name, board.html);
    boards[name] = { x: across, y: 0, w: board.width, h: board.height, title };
    across += board.width + GAP_X;
    top = Math.max(top, board.height + GAP_Y);
  }
  const notes = {
    structure: { x: 0, y: NOTE_Y, text: 'Structure', kind: 'title1', maxW: across - GAP_X },
  };
  const { phone, desktop } = CANVAS_BOARDS;
  const rowHeight = Math.max(phone.height, desktop.height) + GAP_Y;
  app.pages.forEach((page, row) => {
    const title = app.nav.pages.find((p) => p.id === page.id)?.title ?? page.id;
    let x = 0;
    // A page with a local search also gets a phone with it out, since only scrolling shows it,
    // and a page with a menu a phone with its first menu open, since only a tap shows it.
    const searchable = framePage(page.tree).search !== undefined;
    const sheet = app.nav.pages.find((p) => p.id === page.id)?.presentation === 'sheet';
    const menu = sheet ? undefined : firstMenu(page.tree, app.menus);
    const drawn = [
      { board: phone, searching: false, name: phone.label, label: phone.label },
      { board: desktop, searching: false, name: desktop.label, label: desktop.label },
      ...(searchable
        ? [{ board: phone, searching: true, name: 'phone-search', label: 'phone, searching' }]
        : []),
      ...(menu !== undefined
        ? [{ board: phone, searching: false, menu, name: 'phone-menu', label: 'phone, menu open' }]
        : []),
    ];
    for (const { board, searching, menu: open, name: kind, label } of drawn) {
      const name = `${page.id}.${kind}.dc.html`;
      files.set(name, artboard(app, page, board, searching, open));
      boards[name] = {
        x,
        y: top + row * rowHeight,
        w: board.width,
        h: board.height,
        title: `${title} · ${label}`,
      };
      x += board.width + GAP_X;
    }
  });
  const at = now.toISOString();
  const index = {
    v: 3,
    createdOnFiles: { v: 1, at: CANVAS_CREATED_AT },
    title: 'Auralis',
    launch: { view: 'canvas' },
    pages: [],
    boards,
    order: Object.keys(boards),
    notes,
    designSystems: [
      {
        title: sonora.title,
        namespace: DS_FOLDER,
        artifact: sonora.artifact,
        version: sonora.version,
        copiedAt: at,
      },
    ],
  };
  files.set('canvas.json', `${JSON.stringify(index, null, 2)}\n`);
  return files;
}
