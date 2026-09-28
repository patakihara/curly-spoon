/**
 * A canvas page, `design/app/pages/<id>.page.jsx`: one default-exported function returning Sonora
 * components with literal props, `data` paths and, for a prop that takes an element, one Sonora
 * element (a slot, `back={<BackLayer …/>}`), plus `<Each of as>` and `<When state>`. It is read
 * into a page tree, never run, so both platforms can generate from the same file.
 */
import { parse } from '@babel/parser';
import type * as t from '@babel/types';
import { componentName } from './nav.js';

export type PropValue =
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'binding'; path: string[] }
  /** One Sonora element given to a prop that takes an element: `back={<BackLayer />}`. */
  | { kind: 'slot'; tree: PageTree };

export type PageTree =
  | {
      kind: 'element';
      component: string;
      line: number;
      props: Record<string, PropValue>;
      children: PageTree[];
    }
  | { kind: 'each'; line: number; of: string[]; as: string; children: PageTree[] }
  | { kind: 'when'; line: number; state: string; children: PageTree[] }
  | { kind: 'text'; value: string }
  | { kind: 'binding'; line: number; path: string[] }
  /** Several elements given as one: never in a page file, only in the shell's own trees. */
  | { kind: 'fragment'; children: PageTree[] };

const lineOf = (node: t.Node) => node.loc?.start.line ?? 0;
const fail = (node: t.Node, message: string): never => {
  throw new Error(`line ${lineOf(node)}: ${message}`);
};

/** `data.a.b` as `['data', 'a', 'b']`; anything else is refused. */
function memberPath(node: t.Node): string[] {
  if (node.type === 'Identifier') return [node.name];
  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
    return [...memberPath(node.object), node.property.name];
  }
  return fail(node, `${node.type} is not allowed: only literals and data paths`);
}

function propValue(value: t.JSXAttribute['value']): PropValue {
  if (value === null || value === undefined) return { kind: 'literal', value: true };
  if (value.type === 'StringLiteral') return { kind: 'literal', value: value.value };
  if (value.type !== 'JSXExpressionContainer') {
    return fail(value, `${value.type} is not allowed: only literals and data paths`);
  }
  const e = value.expression;
  if (e.type === 'NumericLiteral' || e.type === 'StringLiteral' || e.type === 'BooleanLiteral') {
    return { kind: 'literal', value: e.value };
  }
  if (e.type === 'NullLiteral') return { kind: 'literal', value: null };
  if (e.type === 'JSXEmptyExpression') return fail(value, 'an empty expression is not allowed');
  if (e.type === 'JSXElement') {
    const tree = element(e);
    if (tree.kind !== 'element') return fail(e, 'Each and When go in children, not in a prop');
    return { kind: 'slot', tree };
  }
  if (e.type === 'JSXFragment') {
    return fail(e, 'a fragment is not allowed: only literals, data paths and one Sonora element');
  }
  return { kind: 'binding', path: memberPath(e) };
}

function literalString(props: Record<string, PropValue>, name: string, node: t.Node): string {
  const value = props[name];
  if (value?.kind !== 'literal' || typeof value.value !== 'string') {
    return fail(node, `${name} must be a string literal`);
  }
  return value.value;
}

function children(nodes: t.JSXElement['children']): PageTree[] {
  const out: PageTree[] = [];
  for (const node of nodes) {
    if (node.type === 'JSXText') {
      const value = node.value.replace(/\s+/g, ' ').trim();
      if (value !== '') out.push({ kind: 'text', value });
    } else if (node.type === 'JSXElement') {
      out.push(element(node));
    } else if (node.type === 'JSXExpressionContainer') {
      if (node.expression.type === 'JSXEmptyExpression') continue;
      out.push({ kind: 'binding', line: lineOf(node), path: memberPath(node.expression) });
    } else {
      fail(node, `${node.type} is not allowed`);
    }
  }
  return out;
}

function element(node: t.JSXElement): PageTree {
  const name = node.openingElement.name;
  if (name.type !== 'JSXIdentifier') return fail(node, 'only plain component names are allowed');
  if (!/^[A-Z]/.test(name.name)) return fail(node, `<${name.name}> is not a Sonora component`);
  const props: Record<string, PropValue> = {};
  for (const attr of node.openingElement.attributes) {
    if (attr.type === 'JSXSpreadAttribute') return fail(attr, 'spread props are not allowed');
    if (attr.name.type !== 'JSXIdentifier') return fail(attr, 'namespaced props are not allowed');
    const prop = attr.name.name;
    if (prop === 'style' || prop === 'className' || prop === 'key' || prop === 'ref') {
      return fail(attr, `${prop} is not allowed: the canvas never styles`);
    }
    props[prop] = propValue(attr.value);
  }
  const kids = children(node.children);
  const line = lineOf(node);
  if (name.name === 'Each') {
    const of = props.of;
    if (of?.kind !== 'binding') return fail(node, 'Each needs of={data path}');
    return {
      kind: 'each',
      line,
      of: of.path,
      as: literalString(props, 'as', node),
      children: kids,
    };
  }
  if (name.name === 'When') {
    return { kind: 'when', line, state: literalString(props, 'state', node), children: kids };
  }
  return { kind: 'element', component: name.name, line, props, children: kids };
}

/** Reads a page file into its tree, refusing anything but the page format, with a line number. */
export function parsePage(source: string, id: string): PageTree {
  const file = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const [first, ...rest] = file.program.body;
  if (first === undefined) throw new Error('a page must default-export its function');
  for (const statement of file.program.body) {
    if (statement.type === 'ImportDeclaration') fail(statement, 'imports are not allowed');
  }
  if (rest.length > 0) fail(rest[0]!, 'a page holds only its one function');
  if (
    first.type !== 'ExportDefaultDeclaration' ||
    first.declaration.type !== 'FunctionDeclaration'
  ) {
    return fail(first, 'a page must default-export its function');
  }
  const fn = first.declaration;
  const expected = componentName(id);
  if (fn.id?.name !== expected) fail(fn, `the function must be named ${expected}`);
  const [statement, ...more] = fn.body.body;
  if (statement === undefined || statement.type !== 'ReturnStatement' || more.length > 0) {
    return fail(statement ?? fn, 'the function holds only return (<…/>)');
  }
  const returned = statement.argument;
  if (returned?.type !== 'JSXElement') return fail(statement, 'the function returns one element');
  return element(returned);
}

type Json = unknown;

/** The words a prop takes one of, and whether it also takes null. */
export interface Choice {
  words: string[];
  nullable: boolean;
}

/** Each component's props that take one of a fixed set of words. */
export type Choices = Map<string, Map<string, Choice>>;

const listed = (words: string[]) =>
  words.length === 1 ? words[0]! : `${words.slice(0, -1).join(', ')} or ${words.at(-1)!}`;

/** The value at `path` below `value`, or undefined. */
function resolve(value: Json, path: string[]): Json {
  let at = value;
  for (const key of path) {
    if (at === null || typeof at !== 'object' || Array.isArray(at) || !(key in at))
      return undefined;
    at = (at as Record<string, Json>)[key];
  }
  return at;
}

/**
 * The problems in a page tree, empty when there are none: every binding must resolve in the
 * placeholder (inside `<Each>`, in each item) or, as `shell.…`, in what the shell shows, and every
 * component and prop must be Sonora's. `props` maps each component to the prop names its `.d.ts`
 * declares, `slots` to those of them that take an element; without `slots`, any declared prop may
 * take one. A prop in `choices` takes one of its words (or null, where it takes null), given in
 * the page or bound, in every item a binding resolves to.
 */
export function checkPage(
  tree: PageTree,
  placeholder: Json,
  props: Map<string, Set<string>>,
  slots?: Map<string, Set<string>>,
  shell?: Json,
  choices?: Choices,
): string[] {
  const errors: string[] = [];
  const walk = (node: PageTree, scope: Map<string, Json[]>) => {
    const check = (line: number, path: string[]): Json[] => {
      const [root, ...rest] = path;
      const values =
        root === 'data'
          ? [placeholder]
          : root === 'shell' && shell !== undefined
            ? [shell]
            : scope.get(root ?? '');
      if (values === undefined) {
        errors.push(`line ${line}: ${root} is neither data, the shell nor an Each item`);
        return [];
      }
      const found = values.map((v) => resolve(v, rest));
      if (found.some((v) => v === undefined)) {
        const where = root === 'shell' ? 'the shell' : 'the placeholder';
        errors.push(`line ${line}: ${path.join('.')} is not in ${where}`);
        return [];
      }
      return found;
    };
    switch (node.kind) {
      case 'text':
        return;
      case 'binding':
        check(node.line, node.path);
        return;
      case 'when':
      case 'fragment':
        node.children.forEach((child) => walk(child, scope));
        return;
      case 'each': {
        const lists = check(node.line, node.of);
        if (lists.length === 0) return;
        if (!lists.every((l) => Array.isArray(l) && l.length > 0)) {
          errors.push(`line ${node.line}: ${node.of.join('.')} is not a non-empty list`);
          return;
        }
        const inner = new Map(scope).set(node.as, (lists as Json[][]).flat());
        node.children.forEach((child) => walk(child, inner));
        return;
      }
      case 'element': {
        const declared = props.get(node.component);
        if (declared === undefined) {
          errors.push(`line ${node.line}: ${node.component} is not a Sonora component`);
        } else {
          for (const prop of Object.keys(node.props)) {
            if (!declared.has(prop))
              errors.push(`line ${node.line}: ${node.component} has no prop ${prop}`);
          }
          if (node.children.length > 0 && !declared.has('children')) {
            errors.push(`line ${node.line}: ${node.component} takes no children`);
          }
        }
        for (const [prop, value] of Object.entries(node.props)) {
          const found = value.kind === 'binding' ? check(node.line, value.path) : [];
          const choice = choices?.get(node.component)?.get(prop);
          if (choice !== undefined && value.kind !== 'slot') {
            const given = value.kind === 'literal' ? [value.value] : found;
            const from = value.kind === 'binding' ? ` (${value.path.join('.')})` : '';
            for (const v of given) {
              const fits =
                (typeof v === 'string' && choice.words.includes(v)) ||
                (v === null && choice.nullable);
              if (!fits) {
                errors.push(
                  `line ${node.line}: ${node.component}.${prop} takes ${listed(choice.words)}, not ${JSON.stringify(v)}${from}`,
                );
              }
            }
          }
          if (value.kind !== 'slot') continue;
          const takes = slots?.get(node.component);
          if (declared?.has(prop) && takes !== undefined && !takes.has(prop)) {
            errors.push(`line ${node.line}: ${node.component}.${prop} takes no element`);
          }
          walk(value.tree, scope);
        }
        node.children.forEach((child) => walk(child, scope));
        return;
      }
    }
  };
  walk(tree, new Map());
  return errors;
}
