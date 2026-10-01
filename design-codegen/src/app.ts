/**
 * The canvas, `design/app`: nav.json, shell.json, `pages/<id>.page.jsx` and
 * `placeholders/<id>.json`, read and checked, then generated into the web route table and web pages
 * and the Android nav graph and pages.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  componentName,
  generateNavMap,
  generatePlatform,
  generateRoutes,
  generateWebShell,
  readNav,
  type Nav,
} from './nav.js';
import {
  checkPage,
  parsePage,
  type Choice,
  type Choices,
  type Opens,
  type PageTree,
} from './page.js';
import { generateKotlinPage } from './page-kotlin.js';
import { generateWebPage, type WebComponents } from './page-web.js';
import { androidPages, generateKotlinNav } from './nav-kotlin.js';
import type { KType, PropsModel } from './props.js';
import {
  framePage,
  PLAYER_TABS,
  playerTab,
  readShell,
  shellData,
  type ShellData,
  type ShellFile,
} from './shell.js';

const Placeholder = z.record(z.string(), z.unknown());

export interface AppPage {
  id: string;
  tree: PageTree;
  placeholder: Record<string, unknown>;
}

export interface App {
  nav: Nav;
  /** What the shell shows that no page owns. */
  shell: ShellFile;
  /** The pages drawn so far, in nav.json's order. */
  pages: AppPage[];
  /** The components that take a `platform` prop, and those that take an `onChange` handler. */
  components: WebComponents;
  /**
   * The components that open over the page and close themselves (`onOpenChange`), a menu. A page
   * starts with each closed; the canvas shows a page's first open on its phone-menu artboard.
   */
  menus: Set<string>;
  /** Now Playing's page, which every page's side panel shows; empty until it is drawn. */
  now: PageTree[];
}

/** Whether a tree reads anything from its page's own data, rather than only from the shell. */
function readsData(tree: PageTree): boolean {
  const data = (path: string[]) => path[0] === 'data';
  if (tree.kind === 'text') return false;
  if (tree.kind === 'binding') return data(tree.path);
  if (tree.kind === 'each' && data(tree.of)) return true;
  if (tree.kind === 'element') {
    for (const value of Object.values(tree.props)) {
      if (value.kind === 'binding' && data(value.path)) return true;
      if (value.kind === 'slot' && readsData(value.tree)) return true;
      if (value.kind === 'open' && typeof value.page !== 'string' && data(value.page.path)) {
        return true;
      }
      if (
        (value.kind === 'open' || value.kind === 'request' || value.kind === 'play') &&
        Object.values(value.params).some(data)
      ) {
        return true;
      }
    }
  }
  return tree.children.some(readsData);
}

/** Each component's prop names, from its `<Name>Props` declaration. */
export function propNames(model: PropsModel): Map<string, Set<string>> {
  const names = new Map<string, Set<string>>();
  for (const [component, decls] of model.files) {
    const decl = decls.find((d) => d.kind === 'class' && d.name === `${component}Props`);
    if (decl?.kind !== 'class') continue;
    names.set(component, new Set([...decl.props.map((p) => p.name), ...decl.webOnly]));
  }
  return names;
}

const takesElement = (type: KType): boolean =>
  type.kind === 'slot' || (type.kind === 'nullable' && takesElement(type.type));

/** Each component's props that take an element, `ReactNode` or `JSX.Element`. */
export function slotNames(model: PropsModel): Map<string, Set<string>> {
  const names = new Map<string, Set<string>>();
  for (const [component, decls] of model.files) {
    const decl = decls.find((d) => d.kind === 'class' && d.name === `${component}Props`);
    if (decl?.kind !== 'class') continue;
    names.set(
      component,
      new Set(decl.props.filter((p) => takesElement(p.type)).map((p) => p.name)),
    );
  }
  return names;
}

const takesHandler = (type: KType): boolean =>
  (type.kind === 'fn' && !type.composable) || (type.kind === 'nullable' && takesHandler(type.type));

/** Each component's props that take a handler, a function, which an `<Open>` may be given to. */
export function handlerNames(model: PropsModel): Map<string, Set<string>> {
  const names = new Map<string, Set<string>>();
  for (const [component, decls] of model.files) {
    const decl = decls.find((d) => d.kind === 'class' && d.name === `${component}Props`);
    if (decl?.kind !== 'class') continue;
    names.set(
      component,
      new Set(decl.props.filter((p) => takesHandler(p.type)).map((p) => p.name)),
    );
  }
  return names;
}

const enumOf = (type: KType): string | undefined =>
  type.kind === 'nullable' ? enumOf(type.type) : type.kind === 'named' ? type.name : undefined;

/** Each component's props that take one of a fixed set of words: an enum in its declarations. */
export function choicesOf(model: PropsModel): Choices {
  const enums = new Map(model.shared.map((e) => [e.name, e.values]));
  for (const decls of model.files.values()) {
    for (const d of decls) if (d.kind === 'enum') enums.set(d.name, d.values);
  }
  const choices: Choices = new Map();
  for (const [component, decls] of model.files) {
    const decl = decls.find((d) => d.kind === 'class' && d.name === `${component}Props`);
    if (decl?.kind !== 'class') continue;
    const taking = new Map<string, Choice>();
    for (const p of decl.props) {
      const words = enums.get(enumOf(p.type) ?? '');
      if (words !== undefined) taking.set(p.name, { words, nullable: p.type.kind === 'nullable' });
    }
    if (taking.size > 0) choices.set(component, taking);
  }
  return choices;
}

/** Reads and checks the canvas; throws naming every problem in every page. */
export function readApp(appDir: string, model: PropsModel): App {
  const nav = readNav(appDir);
  const props = propNames(model);
  const slots = slotNames(model);
  const choices = choicesOf(model);
  const handlers = handlerNames(model);
  const routes = new Map(nav.pages.map((p) => [p.id, Object.keys(p.params)]));
  const pagesDir = join(appDir, 'pages');
  const files = existsSync(pagesDir) ? readdirSync(pagesDir).sort() : [];
  const ids = new Set(nav.pages.map((p) => p.id));
  const errors: string[] = [];
  for (const file of files) {
    const id = /^([a-z][A-Za-z0-9]*)\.page\.jsx$/.exec(file)?.[1];
    if (id === undefined || !ids.has(id)) errors.push(`pages/${file}: not a page in nav.json`);
  }
  let shell: ShellFile | undefined;
  let shown: ShellData | undefined;
  try {
    shell = readShell(appDir);
    const strays = shell.railFoot.filter(({ page }) => !ids.has(page));
    for (const { page } of strays) errors.push(`shell.json: railFoot names ${page}, not a page`);
    for (const { page } of shell.railFoot) {
      if (nav.pages.find((p) => p.id === page)?.presentation === 'bare')
        errors.push(`shell.json: railFoot names ${page}, a bare page with no rail`);
    }
    const sheets = nav.pages.filter(
      (p) => p.presentation === 'sheet' && files.includes(`${p.id}.page.jsx`),
    );
    const over = nav.pages.find((p) => p.id === shell!.sheetOver);
    if (sheets.length === 0) {
      // Nothing is drawn over a page yet.
    } else if (over?.presentation !== 'screen' || !over.platforms.includes('web')) {
      errors.push(
        `shell.json: sheetOver names ${shell.sheetOver ?? 'nothing'}, not a web page drawn as a screen, for the player's sheets to be drawn over`,
      );
    } else if (!files.includes(`${over.id}.page.jsx`)) {
      errors.push(`shell.json: sheetOver names ${over.id}, which has no page file`);
    }
    if (strays.length === 0) shown = shellData(nav, shell);
  } catch (e) {
    errors.push(`shell.json: ${(e as Error).message}`);
  }
  const pages: AppPage[] = [];
  for (const { id } of nav.pages) {
    const file = join(pagesDir, `${id}.page.jsx`);
    if (!existsSync(file)) continue;
    try {
      const tree = parsePage(readFileSync(file, 'utf8'), id);
      const placeholder = Placeholder.parse(
        JSON.parse(readFileSync(join(appDir, 'placeholders', `${id}.json`), 'utf8')),
      );
      const opens: Opens = {
        pages: routes,
        links: nav.pages.find((p) => p.id === id)!.structure.links,
        self: id,
        handlers,
      };
      errors.push(
        ...checkPage(tree, placeholder, props, slots, shown, choices, opens).map(
          (e) => `pages/${id}.page.jsx ${e}`,
        ),
      );
      framePage(tree);
      const entry = nav.pages.find((p) => p.id === id)!;
      if (entry.presentation === 'sheet') {
        if (playerTab(entry) === 'now' && readsData(tree)) {
          errors.push(
            `pages/${id}.page.jsx: every page's side panel shows Now Playing, so it binds only shell.…, what is loaded, never its own data.…`,
          );
        }
        if (tree.kind === 'element' && tree.component === 'BackdropShell') {
          errors.push(
            `pages/${id}.page.jsx: a player sheet is its tab's page alone; the shell puts it in the player, never a backdrop`,
          );
        }
      }
      pages.push({ id, tree, placeholder });
    } catch (e) {
      errors.push(`pages/${id}.page.jsx: ${(e as Error).message}`);
    }
  }
  if (errors.length > 0 || shell === undefined) {
    throw new Error(`design/app:\n  ${errors.join('\n  ')}`);
  }
  const taking = (prop: string) =>
    new Set([...props].filter(([, names]) => names.has(prop)).map(([c]) => c));
  const nowPage = pages.find(
    ({ id }) =>
      nav.pages.find((p) => p.id === id)?.presentation === 'sheet' && PLAYER_TABS[id] === 'now',
  );
  return {
    nav,
    shell,
    pages,
    now: nowPage === undefined ? [] : framePage(nowPage.tree).content,
    components: {
      platformed: taking('platform'),
      choices,
    },
    menus: taking('onOpenChange'),
  };
}

/** The first BackLayer in a tree, slots included, in document order. */
function backLayer(tree: PageTree): Extract<PageTree, { kind: 'element' }> | undefined {
  if (tree.kind === 'element') {
    if (tree.component === 'BackLayer') return tree;
    for (const value of Object.values(tree.props)) {
      const found = value.kind === 'slot' ? backLayer(value.tree) : undefined;
      if (found !== undefined) return found;
    }
  }
  if (!('children' in tree)) return undefined;
  for (const child of tree.children) {
    const found = backLayer(child);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * The heading a page shows with its placeholder data: nav.json's `title`, unless its BackLayer
 * binds the title from its data, as an album does, when it is that placeholder value. Both apps'
 * navigation tests look for it, through the generated `headings.json`.
 */
export function pageHeading(
  title: string,
  tree: PageTree | undefined,
  placeholder: Record<string, unknown>,
  id: string,
): string {
  const bound = tree === undefined ? undefined : backLayer(tree)?.props['title'];
  if (bound?.kind !== 'binding' || bound.path[0] !== 'data') return title;
  let value: unknown = placeholder;
  for (const key of bound.path.slice(1)) value = (value as Record<string, unknown>)[key];
  if (typeof value !== 'string') throw new Error(`${id}: ${bound.path.join('.')} is not a string`);
  return value;
}

/** `headings.json`: each page of nav.json, both platforms', by id to the heading it shows. */
function generateHeadings(app: App): string {
  const headings = Object.fromEntries(
    app.nav.pages.map((p) => {
      const drawn = app.pages.find(({ id }) => id === p.id);
      return [p.id, pageHeading(p.title, drawn?.tree, drawn?.placeholder ?? {}, p.id)];
    }),
  );
  return `${JSON.stringify(headings, null, 2)}\n`;
}

export function generateAppWeb(app: App): { nav: Map<string, string>; pages: Map<string, string> } {
  const drawn = new Set(app.pages.map((p) => p.id));
  return {
    nav: new Map([
      ['routes.tsx', generateRoutes(app.nav, drawn, app.shell.sheetOver)],
      ['Shell.tsx', generateWebShell()],
      ['platform.ts', generatePlatform(app.nav)],
      [
        'stacks.ts',
        generateNavMap(
          app.nav,
          app.shell.railFoot.map((f) => f.page),
        ),
      ],
      ['headings.json', generateHeadings(app)],
    ]),
    pages: new Map(
      app.pages
        .filter(({ id }) => app.nav.pages.find((p) => p.id === id)?.platforms.includes('web'))
        .map(({ id, tree, placeholder }) => [
          `${componentName(id)}.tsx`,
          generateWebPage(tree, id, placeholder, app.components, {
            nav: app.nav,
            shell: app.shell,
            page: app.nav.pages.find((p) => p.id === id)!,
            now: app.now,
          }),
        ]),
    ),
  };
}

export function generateAppKotlin(
  app: App,
  model: PropsModel,
): { nav: Map<string, string>; pages: Map<string, string> } {
  const android = new Set(androidPages(app.nav).map((p) => p.id));
  const drawn = app.pages.filter(({ id }) => android.has(id));
  return {
    nav: new Map([
      ['AuralisNavGraph.kt', generateKotlinNav(app.nav, new Set(drawn.map(({ id }) => id)))],
    ]),
    pages: new Map(
      drawn.map(({ id, tree, placeholder }) => [
        `${componentName(id)}Page.kt`,
        generateKotlinPage(tree, id, placeholder, model, {
          nav: app.nav,
          shell: app.shell,
          page: app.nav.pages.find((p) => p.id === id)!,
          now: app.now,
        }),
      ]),
    ),
  };
}
