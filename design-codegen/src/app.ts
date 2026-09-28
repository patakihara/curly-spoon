/**
 * The canvas, `design/app`: nav.json, shell.json, `pages/<id>.page.jsx` and
 * `placeholders/<id>.json`, read and checked, then generated into the web route table and web pages.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { componentName, generatePlatform, generateRoutes, readNav, type Nav } from './nav.js';
import {
  checkPage,
  parsePage,
  type Choice,
  type Choices,
  type Opens,
  type PageTree,
} from './page.js';
import { generateWebPage, type WebComponents } from './page-web.js';
import type { KType, PropsModel } from './props.js';
import { framePage, readShell, shellData, type ShellData, type ShellFile } from './shell.js';

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
        handlers,
      };
      errors.push(
        ...checkPage(tree, placeholder, props, slots, shown, choices, opens).map(
          (e) => `pages/${id}.page.jsx ${e}`,
        ),
      );
      framePage(tree);
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
  return {
    nav,
    shell,
    pages,
    components: {
      platformed: taking('platform'),
      handled: taking('onChange'),
      choices,
    },
  };
}

export function generateAppWeb(app: App): { nav: Map<string, string>; pages: Map<string, string> } {
  const drawn = new Set(app.pages.map((p) => p.id));
  return {
    nav: new Map([
      ['routes.tsx', generateRoutes(app.nav, drawn)],
      ['platform.ts', generatePlatform(app.nav)],
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
          }),
        ]),
    ),
  };
}
