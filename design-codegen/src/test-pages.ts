/** Test support: a drawn canvas page read with its placeholder, and walks over its tree. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_DIR, REPO_ROOT } from './outputs.js';
import { parsePage, type PageTree, type PropValue } from './page.js';

const appDir = join(REPO_ROOT, APP_DIR);

export type Element = Extract<PageTree, { kind: 'element' }>;

/** `design/app/pages/<id>.page.jsx` as a tree, and its placeholder. */
export const readPage = (id: string) => ({
  tree: parsePage(readFileSync(join(appDir, 'pages', `${id}.page.jsx`), 'utf8'), id),
  data: JSON.parse(readFileSync(join(appDir, 'placeholders', `${id}.json`), 'utf8')) as Record<
    string,
    unknown
  >,
});

/** Every element in the tree, slots included, in document order. */
export function elements(tree: PageTree | undefined, into: Element[] = []): Element[] {
  if (tree === undefined) return into;
  if (tree.kind === 'element') {
    into.push(tree);
    for (const v of Object.values(tree.props)) if (v.kind === 'slot') elements(v.tree, into);
  }
  if ('children' in tree) tree.children.forEach((c) => elements(c, into));
  return into;
}

/** Every `data.` / `shell.` path the page binds, in props, children and Each lists. */
export function bindings(tree: PageTree, into: string[] = []): string[] {
  const prop = (v: PropValue) => {
    if (v.kind === 'binding') into.push(v.path.join('.'));
    if (v.kind === 'slot') bindings(v.tree, into);
    if (v.kind === 'open' || v.kind === 'request' || v.kind === 'play')
      Object.values(v.params).forEach((path) => into.push(path.join('.')));
  };
  if (tree.kind === 'binding') into.push(tree.path.join('.'));
  if (tree.kind === 'each') into.push(tree.of.join('.'));
  if (tree.kind === 'element') Object.values(tree.props).forEach(prop);
  if ('children' in tree) tree.children.forEach((c) => bindings(c, into));
  return into;
}

/** The top-level `data.` keys a page binds, sorted. */
export const dataRoots = (tree: PageTree): string[] =>
  [
    ...new Set(
      bindings(tree)
        .filter((p) => p.startsWith('data.'))
        .map((p) => p.split('.')[1]!),
    ),
  ].sort();

/** What an element shows, read through its placeholder: each prop's values, one per item. */
export interface Shown {
  element: Element;
  /** The `of` paths of the Each lists the element sits in, outermost first, as `data.library`. */
  within: string[];
  /** A prop's values in every item it is drawn for; a literal is one value, a slot none. */
  values: (prop: string) => unknown[];
  /** The element's own text and bound children, in every item. */
  text: unknown[];
}

/** Every element of a page with its props resolved against the placeholder, slots included. */
export function shown(tree: PageTree, data: Record<string, unknown>): Shown[] {
  const out: Shown[] = [];
  const at = (value: unknown, path: string[]) =>
    path.reduce<unknown>(
      (v, k) =>
        v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined,
      value,
    );
  const walk = (node: PageTree, scope: Map<string, unknown[]>, within: string[]) => {
    const read = (path: string[]): unknown[] => {
      const [root = '', ...rest] = path;
      const values = root === 'data' ? [data] : (scope.get(root) ?? []);
      return values.map((v) => at(v, rest));
    };
    if (node.kind === 'each') {
      const items = read(node.of).flatMap((l) => (Array.isArray(l) ? l : []));
      const inner = new Map(scope).set(node.as, items);
      node.children.forEach((c) => walk(c, inner, [...within, node.of.join('.')]));
      return;
    }
    if (node.kind !== 'element') {
      if ('children' in node) node.children.forEach((c) => walk(c, scope, within));
      return;
    }
    const values = (prop: string): unknown[] => {
      const v = node.props[prop];
      if (v === undefined || v.kind === 'slot') return [];
      if (v.kind === 'literal') return [v.value];
      if (v.kind === 'binding') return read(v.path);
      return [];
    };
    const text = node.children.flatMap((c) =>
      c.kind === 'text' ? [c.value] : c.kind === 'binding' ? read(c.path) : [],
    );
    out.push({ element: node, within, values, text });
    for (const v of Object.values(node.props)) if (v.kind === 'slot') walk(v.tree, scope, within);
    node.children.forEach((c) => walk(c, scope, within));
  };
  walk(tree, new Map(), []);
  return out;
}
