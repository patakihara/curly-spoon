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
