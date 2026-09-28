/**
 * The canvas, `design/app`: nav.json, shell.json, `pages/<id>.page.jsx` and
 * `placeholders/<id>.json`, read and checked, then generated into the web route table and web pages.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { componentName, generatePlatform, generateRoutes, readNav, type Nav } from './nav.js';
import { checkPage, parsePage, type PageTree } from './page.js';
import { generateWebPage, type WebComponents } from './page-web.js';
import type { KType, PropsModel } from './props.js';
import { framePage, readShell, type ShellFile } from './shell.js';

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

/** Reads and checks the canvas; throws naming every problem in every page. */
export function readApp(appDir: string, model: PropsModel): App {
  const nav = readNav(appDir);
  const props = propNames(model);
  const slots = slotNames(model);
  const pagesDir = join(appDir, 'pages');
  const files = existsSync(pagesDir) ? readdirSync(pagesDir).sort() : [];
  const ids = new Set(nav.pages.map((p) => p.id));
  const errors: string[] = [];
  for (const file of files) {
    const id = /^([a-z][A-Za-z0-9]*)\.page\.jsx$/.exec(file)?.[1];
    if (id === undefined || !ids.has(id)) errors.push(`pages/${file}: not a page in nav.json`);
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
      errors.push(
        ...checkPage(tree, placeholder, props, slots).map((e) => `pages/${id}.page.jsx ${e}`),
      );
      framePage(tree);
      pages.push({ id, tree, placeholder });
    } catch (e) {
      errors.push(`pages/${id}.page.jsx: ${(e as Error).message}`);
    }
  }
  let shell: ShellFile | undefined;
  try {
    shell = readShell(appDir);
    for (const { page } of shell.railFoot) {
      if (!ids.has(page)) errors.push(`shell.json: railFoot names ${page}, not a page`);
    }
  } catch (e) {
    errors.push(`shell.json: ${(e as Error).message}`);
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
    components: { platformed: taking('platform'), handled: taking('onChange') },
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
