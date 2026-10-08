/**
 * The Android gallery: each Sonora component Android has a composable for, drawn with the same
 * usage the web gallery draws, so the two cannot drift. The usage's JSX is read as literals: a
 * prop Android's props class takes is written as Kotlin, typed by the props model, and a prop it
 * does not take is left out. A handler is a no-op lambda. An element given to a slot, or as
 * children, is drawn inside it: a Sonora component Android has by its composable, a component it
 * lacks or an intrinsic element by what it holds, and text as `BasicText`; an optional slot that
 * would draw nothing, such as an `Icon` Android has no composable for, is left out. The web frame around the
 * usage is the browser's, so it is dropped; `platform` is always `mobile`, since Android is the
 * phone. The Paparazzi test in `:sonora` snapshots every entry.
 */
import { parseExpression } from '@babel/parser';
import type * as t from '@babel/types';
import { GALLERY_HANDLER, type GalleryEntry } from './gallery.js';
import {
  call,
  declsOf,
  handlerArity,
  isSlot,
  KotlinValues,
  lambda,
  print,
  raw,
  STEP,
  type Decls,
  type Expr,
} from './page-kotlin.js';
import { kotlinString } from './nav-kotlin.js';
import { GENERATED_NOTE, KOTLIN_PACKAGE, KOTLIN_SONORA_PACKAGE } from './outputs.js';
import type { KType, PropsModel } from './props.js';

export const KOTLIN_GALLERY_PACKAGE = 'net.develivarr.auralis.generated.gallery';
/** The hand-written registry type every entry is, in the `:sonora` tests' Sonora package. */
const ENTRY = 'GalleryEntry';

/** A JSX element or fragment found among a usage's literal values. */
interface Element {
  jsx: t.JSXElement | t.JSXFragment;
}
/** A function found among a usage's literal values: a handler, or a `renderRow`. */
interface Fn {
  fn: t.ArrowFunctionExpression;
}
const isElement = (v: unknown): v is Element =>
  v !== null && typeof v === 'object' && Object.hasOwn(v, 'jsx');
/** A handler that does nothing, which the web gallery's one handler reads as. */
const NO_OP = parseExpression('() => {}') as t.ArrowFunctionExpression;
const isFn = (v: unknown): v is Fn => v !== null && typeof v === 'object' && Object.hasOwn(v, 'fn');

/** Text as the browser lays it out: runs of whitespace are one space. */
const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

class GalleryWriter extends KotlinValues {
  readonly composables = new Set<string>();

  constructor(
    id: string,
    decls: Decls,
    private readonly android: ReadonlySet<string>,
  ) {
    super(id, decls);
  }

  /** A literal JSX value as plain data, with its elements and functions kept as nodes. */
  data(node: t.Node): unknown {
    switch (node.type) {
      case 'StringLiteral':
      case 'NumericLiteral':
      case 'BooleanLiteral':
        return node.value;
      case 'NullLiteral':
        return null;
      case 'TemplateLiteral':
        return node.quasis.map((q) => q.value.cooked ?? '').join('');
      case 'UnaryExpression': {
        const value = this.data(node.argument);
        return typeof value === 'number' ? -value : this.fail('a minus on a non-number');
      }
      case 'Identifier':
        if (node.name === 'undefined') return undefined;
        // The web gallery's one handler stands for the card's, as a no-op lambda does here.
        if (node.name === GALLERY_HANDLER) return { fn: NO_OP } satisfies Fn;
        return this.fail(`${node.name} is not a literal`);
      case 'ArrayExpression':
        return node.elements.flatMap((e) =>
          e === null
            ? []
            : e.type === 'SpreadElement'
              ? (this.data(e.argument) as unknown[])
              : [this.data(e)],
        );
      case 'ObjectExpression': {
        const out: Record<string, unknown> = {};
        for (const p of node.properties) {
          if (p.type === 'SpreadElement') Object.assign(out, this.data(p.argument));
          else if (p.type === 'ObjectProperty' && !p.computed) {
            const key = p.key.type === 'Identifier' ? p.key.name : String(this.data(p.key));
            out[key] = this.data(p.value);
          } else this.fail('an object member that is not a plain property');
        }
        return out;
      }
      case 'ArrowFunctionExpression':
        return { fn: node } satisfies Fn;
      case 'JSXElement':
      case 'JSXFragment':
        return { jsx: node } satisfies Element;
      case 'JSXExpressionContainer':
        return node.expression.type === 'JSXEmptyExpression'
          ? undefined
          : this.data(node.expression);
      default:
        return this.fail(`${node.type} is not a literal`);
    }
  }

  /** The statements drawing a slot's or a child's value. */
  draw(value: unknown): Expr[] {
    if (value === undefined || value === null || typeof value === 'boolean') return [];
    if (typeof value === 'string' || typeof value === 'number') {
      const text = collapse(String(value));
      if (text === '') return [];
      this.text = true;
      return [call('BasicText', [[null, raw(kotlinString(text))]])];
    }
    if (Array.isArray(value)) return value.flatMap((v) => this.draw(v));
    if (isElement(value)) return this.jsx(value.jsx);
    return this.fail(`cannot draw ${JSON.stringify(value)}`);
  }

  /** The statements drawing one JSX node. */
  jsx(node: t.Node): Expr[] {
    if (node.type === 'JSXText') return this.draw(node.value);
    if (node.type === 'JSXExpressionContainer') return this.draw(this.data(node));
    if (node.type === 'JSXFragment') return node.children.flatMap((c) => this.jsx(c));
    if (node.type !== 'JSXElement') return this.fail(`${node.type} is not an element`);
    const name = node.openingElement.name;
    if (name.type === 'JSXIdentifier' && this.android.has(name.name)) {
      return [this.element(name.name, node)];
    }
    return node.children.flatMap((c) => this.jsx(c));
  }

  /** A Sonora component Android has, called with its generated props. */
  element(component: string, node: t.JSXElement): Expr {
    const c = this.decls.classes.get(`${component}Props`);
    if (c === undefined) return this.fail(`${component} has no props class`);
    this.composables.add(component);
    this.types.add(c.name);
    const given = new Map<string, unknown>();
    for (const attr of node.openingElement.attributes) {
      if (attr.type === 'JSXSpreadAttribute') {
        for (const [k, v] of Object.entries(this.data(attr.argument) as object)) given.set(k, v);
      } else if (attr.name.type === 'JSXIdentifier') {
        given.set(attr.name.name, attr.value == null ? true : this.data(attr.value));
      }
    }
    const children = node.children.filter(
      (ch) => !(ch.type === 'JSXText' && collapse(ch.value) === ''),
    );
    if (children.length > 0) given.set('children', { jsx: { ...node, type: 'JSXFragment' } });
    const args: [string, Expr][] = [];
    for (const p of c.props) {
      const where = `${component}.${p.name}`;
      const value = p.name === 'platform' ? 'mobile' : given.get(p.name);
      if (value === undefined) {
        if (p.optional) continue;
        if (p.type.kind === 'nullable') args.push([p.name, raw('null')]);
        else this.fail(`${where} is required and not given`);
        continue;
      }
      const drawn = this.prop(p.type, value, where);
      if (p.optional && isSlot(p.type) && drawn === EMPTY) continue;
      args.push([p.name, drawn]);
    }
    const last = args.findIndex(([n]) => n === 'children');
    if (last >= 0) args.push(...args.splice(last, 1));
    return call(component, [[null, call(c.name, args)]]);
  }

  prop(type: KType, value: unknown, where: string): Expr {
    const arity = handlerArity(type);
    if (arity !== undefined) {
      if (!isFn(value)) return this.fail(`${where} takes a handler`);
      return lambda([], Array.from({ length: arity }, () => '_').join(', '));
    }
    if (isSlot(type) && (isElement(value) || Array.isArray(value))) {
      const body = this.draw(value);
      return body.length === 0 ? EMPTY : lambda(body);
    }
    return this.value(type, value, where);
  }
}

/** A slot's lambda that draws nothing, which an optional slot leaves out. */
const EMPTY: Expr = lambda([]);

/** The usage's own element: the first one naming the entry's component, inside any frame. */
function usage(node: t.Node, name: string): t.JSXElement | undefined {
  if (node.type === 'JSXElement') {
    const n = node.openingElement.name;
    if (n.type === 'JSXIdentifier' && n.name === name) return node;
    for (const child of node.children) {
      const found = usage(child, name);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/**
 * The icon names the web gallery draws, sorted: every `icon` prop or item field given a name, every
 * Icon's `name`, and every glyph span set in Material Symbols Rounded.
 */
export function galleryIcons(entries: GalleryEntry[]): string[] {
  const names = new Set<string>();
  for (const { jsx } of entries) {
    for (const m of jsx.matchAll(/\bicon\s*[=:]\s*["'`]([a-z0-9_]+)["'`]/g)) names.add(m[1]!);
    for (const m of jsx.matchAll(/<Icon\b[^>]*?\bname\s*=\s*["'`]([a-z0-9_]+)["'`]/g))
      names.add(m[1]!);
    for (const m of jsx.matchAll(/Material Symbols Rounded[^>]*>\s*([a-z0-9_]+)\s*</g))
      names.add(m[1]!);
  }
  return [...names].sort();
}

/**
 * `SonoraGallery.kt`: the icon names the web gallery draws, and one `GalleryEntry` per web gallery
 * entry whose component `android` has a composable for, in the web gallery's order. A composable
 * with no web entry gets none here; the gallery tests on both sides name it.
 */
export function generateKotlinGallery(
  entries: GalleryEntry[],
  model: PropsModel,
  android: ReadonlySet<string>,
): Map<string, string> {
  const decls = declsOf(model);
  const imports = new Set<string>([`${KOTLIN_SONORA_PACKAGE}.${ENTRY}`]);
  const drawn = entries.filter((e) => android.has(e.name));
  const items = drawn.map((e) => {
    const writer = new GalleryWriter(`${e.card}: ${e.name}`, decls, android);
    const root = usage(parseExpression(e.jsx, { plugins: ['jsx'] }), e.name);
    if (root === undefined) return writer.fail('the usage names another component');
    const body = print(writer.element(e.name, root), STEP + STEP, STEP.length * 2);
    if (writer.text) imports.add('androidx.compose.foundation.text.BasicText');
    for (const c of writer.composables) imports.add(`${KOTLIN_SONORA_PACKAGE}.${c}`);
    for (const ty of writer.types) imports.add(`${KOTLIN_PACKAGE}.${ty}`);
    return `${STEP}${ENTRY}(${kotlinString(e.name)}) {\n${STEP}${STEP}${body}\n${STEP}},\n`;
  });
  const kotlin = [
    `// ${GENERATED_NOTE}`,
    `package ${KOTLIN_GALLERY_PACKAGE}`,
    '',
    ...[...imports].sort().map((i) => `import ${i}`),
    '',
    '/** The icon names the web gallery draws, for the icon specimen. */',
    `val galleryIcons: List<String> = ${print(
      call(
        'listOf',
        galleryIcons(entries).map((n) => [null, raw(kotlinString(n))]),
      ),
      '',
      34,
    )}`,
    '',
    '/** Each Sonora component Android draws, with the usage the web gallery draws it with. */',
    `val componentGallery: List<${ENTRY}> = listOf(`,
    `${items.join('')})`,
    '',
  ].join('\n');
  return new Map([['SonoraGallery.kt', kotlin]]);
}
