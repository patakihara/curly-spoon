/**
 * The web gallery: every Sonora component drawn once, in dark and light, from its first usage in
 * Sonora's showcase cards (`components/<folder>/*.card.html`) whose props are all literals. A
 * literal is a string, number, boolean or null, an object or array of literals, an element whose
 * own props and children are literals (a glyph span, another Sonora component), or a top-level
 * `const` of the card's script holding one, which is written inline, or a function that reads only
 * its own arguments and literals (a `renderRow`). A handler (`on…`) becomes a no-op, whatever the
 * card's does. A usage that reads state or calls a function in any other prop is skipped for the
 * next one. An intrinsic element holding the usage, with literal props, frames it in the gallery as
 * in the card, so a layout that fills its parent gets the box the card gives it. A component with none is missing, and the
 * gallery test names it: its card needs a usage with literal props (docs/plan/11-front.md).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from '@babel/parser';
import type * as t from '@babel/types';
import { GENERATED_NOTE } from './outputs.js';
import type { Component } from './sonora.js';

export interface Card {
  /** The card's path under `components/`, such as `basic/buttons.card.html`. */
  path: string;
  /** The card's Babel script. */
  script: string;
}

export interface GalleryEntry {
  name: string;
  /** The card the usage comes from, relative to `components/`. */
  card: string;
  /** The usage's JSX, with every constant it reads written inline. */
  jsx: string;
  /** The Sonora components the usage draws, itself included, sorted. */
  uses: string[];
}

/** Every card under `<sonoraDir>/components`, in path order, with its Babel script. */
export function readCards(sonoraDir: string): Card[] {
  const root = join(sonoraDir, 'components');
  const cards: Card[] = [];
  const folders = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  for (const folder of folders) {
    for (const file of readdirSync(join(root, folder)).sort()) {
      if (!file.endsWith('.card.html')) continue;
      const html = readFileSync(join(root, folder, file), 'utf8');
      const script = /<script type="text\/babel">([\s\S]*?)<\/script>/.exec(html)?.[1];
      if (script !== undefined) {
        cards.push({ path: relative(root, join(root, folder, file)), script });
      }
    }
  }
  return cards;
}

const NO_OP = '{() => {}}';
const NONE: ReadonlySet<string> = new Set();

/** Adds the names a parameter binds to `names`; false for a pattern this reader does not take. */
function bind(pattern: t.Node, names: Set<string>): boolean {
  switch (pattern.type) {
    case 'Identifier':
      names.add(pattern.name);
      return true;
    case 'RestElement':
      return bind(pattern.argument, names);
    case 'ObjectPattern':
      return pattern.properties.every((p) =>
        p.type === 'RestElement' ? bind(p, names) : !p.computed && bind(p.value, names),
      );
    case 'ArrayPattern':
      return pattern.elements.every((e) => e !== null && bind(e, names));
    default:
      return false;
  }
}

interface Edit {
  start: number;
  end: number;
  text: () => string;
}

/** A card's script, with its top-level constants, read for usages whose props are literals. */
class Script {
  readonly consts = new Map<string, t.Expression>();
  private readonly checking = new Set<string>();

  constructor(
    readonly source: string,
    readonly program: t.Program,
    readonly components: ReadonlySet<string>,
  ) {
    for (const stmt of program.body) {
      if (stmt.type !== 'VariableDeclaration' || stmt.kind !== 'const') continue;
      for (const decl of stmt.declarations) {
        if (decl.id.type === 'Identifier' && decl.init != null) {
          this.consts.set(decl.id.name, decl.init);
        }
      }
    }
  }

  /** The edits that write `node` with its constants inline, or undefined when it is not literal. */
  literal(node: t.Node, uses: Set<string>, locals: ReadonlySet<string> = NONE): Edit[] | undefined {
    const edits: Edit[] = [];
    const all = (nodes: (t.Node | null | undefined)[], scope = locals): boolean =>
      nodes.every((n) => {
        if (n == null) return false;
        const inner = this.literal(n, uses, scope);
        if (inner === undefined) return false;
        edits.push(...inner);
        return true;
      });
    switch (node.type) {
      case 'StringLiteral':
      case 'NumericLiteral':
      case 'BooleanLiteral':
      case 'NullLiteral':
      case 'JSXText':
      case 'JSXEmptyExpression':
        return edits;
      case 'TemplateLiteral':
        return node.expressions.length === 0 ? edits : undefined;
      case 'UnaryExpression':
        return node.operator === '-' && all([node.argument]) ? edits : undefined;
      case 'ArrayExpression':
        return all(node.elements) ? edits : undefined;
      case 'SpreadElement':
      case 'JSXSpreadAttribute':
        return all([node.argument]) ? edits : undefined;
      case 'ObjectExpression':
        for (const prop of node.properties) {
          if (prop.type === 'SpreadElement') {
            if (!all([prop])) return undefined;
          } else if (prop.type !== 'ObjectProperty' || prop.computed) {
            return undefined;
          } else if (
            prop.shorthand &&
            prop.value.type === 'Identifier' &&
            !locals.has(prop.value.name)
          ) {
            const name = prop.value.name;
            const inline = this.inline(name, uses);
            if (inline === undefined) return undefined;
            edits.push({ start: prop.start!, end: prop.end!, text: () => `${name}: ${inline()}` });
          } else if (!all([prop.value])) {
            return undefined;
          }
        }
        return edits;
      case 'Identifier': {
        if (node.name === 'undefined' || locals.has(node.name)) return edits;
        const inline = this.inline(node.name, uses);
        if (inline === undefined) return undefined;
        return [{ start: node.start!, end: node.end!, text: inline }];
      }
      case 'MemberExpression':
        if (node.computed ? !all([node.property]) : node.property.type !== 'Identifier') {
          return undefined;
        }
        return all([node.object]) ? edits : undefined;
      case 'ArrowFunctionExpression': {
        // A function that reads only its own arguments and literals, such as a `renderRow`.
        const names = new Set(locals);
        if (node.body.type === 'BlockStatement' || !node.params.every((p) => bind(p, names))) {
          return undefined;
        }
        return all([node.body], names) ? edits : undefined;
      }
      case 'JSXExpressionContainer':
        return all([node.expression]) ? edits : undefined;
      case 'JSXFragment':
        return all(node.children) ? edits : undefined;
      case 'JSXElement': {
        const name = node.openingElement.name;
        if (name.type !== 'JSXIdentifier') return undefined;
        if (/^[A-Z]/.test(name.name)) {
          if (!this.components.has(name.name)) return undefined;
          uses.add(name.name);
        }
        const given: t.Node[] = [];
        for (const attr of node.openingElement.attributes) {
          if (attr.type === 'JSXSpreadAttribute') given.push(attr);
          else if (attr.value == null) continue;
          else if (attr.name.type === 'JSXIdentifier' && /^on[A-Z]/.test(attr.name.name)) {
            // A handler does nothing in the gallery, whatever the card's does.
            edits.push({ start: attr.value.start!, end: attr.value.end!, text: () => NO_OP });
          } else given.push(attr.value);
        }
        return all(given) && all(node.children) ? edits : undefined;
      }
      default:
        return undefined;
    }
  }

  /** How to write the constant `name` inline, or undefined when it is not a literal constant. */
  private inline(name: string, uses: Set<string>): (() => string) | undefined {
    const init = this.consts.get(name);
    if (init === undefined || this.checking.has(name)) return undefined;
    this.checking.add(name);
    const edits = this.literal(init, uses);
    this.checking.delete(name);
    return edits === undefined ? undefined : () => `(${this.write(init, edits)})`;
  }

  /** `node`'s source with `edits` applied. */
  write(node: t.Node, edits: Edit[]): string {
    let text = '';
    let at = node.start!;
    for (const edit of [...edits].sort((a, b) => a.start - b.start)) {
      text += this.source.slice(at, edit.start) + edit.text();
      at = edit.end;
    }
    return text + this.source.slice(at, node.end!);
  }
}

/**
 * Every JSX element under `node`, in source order, each with the intrinsic element (`<div>`) that
 * holds it as a direct child, if one does.
 */
function elements(
  node: t.Node,
  out: { element: t.JSXElement; holder?: t.JSXElement }[] = [],
  holder?: t.JSXElement,
): { element: t.JSXElement; holder?: t.JSXElement }[] {
  if (node.type === 'JSXElement') {
    out.push({ element: node, holder });
    const name = node.openingElement.name;
    const intrinsic = name.type === 'JSXIdentifier' && /^[a-z]/.test(name.name);
    for (const attr of node.openingElement.attributes) elements(attr, out);
    for (const child of node.children) elements(child, out, intrinsic ? node : undefined);
    return out;
  }
  for (const value of Object.values(node)) {
    const children: unknown[] = Array.isArray(value) ? value : [value];
    for (const child of children) {
      if (
        child !== null &&
        typeof child === 'object' &&
        typeof (child as t.Node).type === 'string'
      ) {
        elements(child as t.Node, out);
      }
    }
  }
  return out;
}

/**
 * The holder's opening and closing tags, when all its props are literal and it sets no theme: the
 * frame the card gives a usage, such as the sized box a layout fills, so the gallery gives it too.
 */
function frame(script: Script, holder: t.JSXElement | undefined): [string, string] {
  if (holder === undefined) return ['', ''];
  const open = holder.openingElement;
  const themed = open.attributes.some(
    (a) =>
      a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === 'data-theme',
  );
  const edits = themed ? undefined : script.literal({ ...holder, children: [] }, new Set());
  if (edits === undefined) return ['', ''];
  const name = (open.name as t.JSXIdentifier).name;
  return [script.write(open, edits), `</${name}>`];
}

/** Each component's first usage whose props are all literals, and the components with none. */
export function galleryEntries(
  components: Component[],
  cards: Card[],
): { entries: GalleryEntry[]; missing: string[] } {
  const names = new Set(components.map((c) => c.name));
  const found = new Map<string, GalleryEntry>();
  for (const card of cards) {
    const program = parse(card.script, { sourceType: 'script', plugins: ['jsx'] }).program;
    const script = new Script(card.script, program, names);
    for (const { element, holder } of elements(program)) {
      const name = element.openingElement.name;
      if (name.type !== 'JSXIdentifier' || !names.has(name.name) || found.has(name.name)) continue;
      const uses = new Set<string>();
      const edits = script.literal(element, uses);
      if (edits === undefined) continue;
      const [open, close] = frame(script, holder);
      found.set(name.name, {
        name: name.name,
        card: card.path,
        jsx: open + script.write(element, edits) + close,
        uses: [...uses].sort(),
      });
    }
  }
  const entries = components.flatMap((c) => found.get(c.name) ?? []);
  const missing = components.filter((c) => !found.has(c.name)).map((c) => c.name);
  return { entries, missing };
}

const THEMED = `/** Each component in both themes, side by side, as every Sonora card draws its demo. */
const pane = {
  position: 'relative',
  flex: '1 1 380px',
  minWidth: 0,
  background: 'var(--surface-bg)',
  color: 'var(--surface-fg)',
  fontFamily: 'var(--font-body)',
  padding: 20,
};

// The page's own scroller: the app's base.css holds the body to the window, as the shell wants.
export function Gallery() {
  return (
    <main style={{ height: '100%', overflow: 'auto' }}>
      {gallery.map(({ name, render }) => (
        <section key={name} data-component={name} aria-label={name} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div data-theme="dark" style={pane}>{render()}</div>
          <div data-theme="light" style={pane}>{render()}</div>
        </section>
      ))}
    </main>
  );
}
`;

const DTS = `// ${GENERATED_NOTE}
import type { JSX } from 'react';

export interface GalleryEntry {
  /** The Sonora component this entry draws. */
  name: string;
  /** The Sonora card its usage comes from, under design/sonora/components. */
  card: string;
  render: () => JSX.Element;
}

/** Every Sonora component, once, from its card. */
export declare const gallery: readonly GalleryEntry[];

/** Every entry in a section of its own, \`data-component\` naming it, in dark and light. */
export declare function Gallery(): JSX.Element;
`;

/** `web/src/generated/gallery`: the entries, and the page that draws them. */
export function generateGallery(sonoraDir: string, components: Component[]): Map<string, string> {
  const { entries } = galleryEntries(components, readCards(sonoraDir));
  const imports = [...new Set(entries.flatMap((e) => e.uses))].sort();
  const list = entries
    .map(
      (e) =>
        `  {\n    name: '${e.name}',\n    card: '${e.card}',\n    render: () => (${e.jsx}),\n  },\n`,
    )
    .join('');
  const jsx =
    `// ${GENERATED_NOTE}\n` +
    `import { ${imports.join(', ')} } from '../ui';\n\n` +
    `/** Each Sonora component as its first card usage whose props are all literals. */\n` +
    `export const gallery = [\n${list}];\n\n` +
    THEMED;
  return new Map([
    ['index.jsx', jsx],
    ['index.d.ts', DTS],
  ]);
}
