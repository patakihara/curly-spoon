/**
 * A canvas page, `design/app/pages/<id>.page.jsx`: one default-exported function returning Sonora
 * components with literal props, `data` paths and, for a prop that takes an element, one Sonora
 * element (a slot, `back={<BackLayer …/>}`), plus `<Each of as>` and `<When state>`. A handler
 * prop may open another page, `onClick={<Open page="album" ref={release.ref} />}` (or `page={item.page}`, each
 * item naming its own): the page's id
 * in nav.json and each of its route's parameters bound to a data path; or request an item,
 * `onRequest={<Request ref={book.ref} />}`, its ref bound the same way; or play one on the queue it
 * names, `onPlay={<Play ref={episode.ref} queue="spoken" />}`, `next` for Play next, `source` for a list played on its own; or
 * start signing in, `onClick={<SignIn />}`. It is read into a page
 * tree, never run, so both platforms can generate from the same file: the web as a navigation to
 * the route, Android as one to the nav graph's destination with the same arguments.
 */
import { parse } from '@babel/parser';
import type * as t from '@babel/types';
import { componentName } from './nav.js';

export type PropValue =
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'binding'; path: string[] }
  /** One Sonora element given to a prop that takes an element: `back={<BackLayer />}`. */
  | { kind: 'slot'; tree: PageTree }
  /**
   * A handler that opens a page of nav.json, each route parameter bound to a data path. The page
   * is its id, or `{ path }`, bound to the item's data, for a list of items of several kinds.
   */
  | { kind: 'open'; page: string | { path: string[] }; params: Record<string, string[]> }
  /** A handler that requests the item its `ref` binds, such as a book you don't own. */
  | { kind: 'request'; params: Record<string, string[]> }
  /**
   * A handler that plays the item its `ref` binds, now or next, on the spoken or the music queue;
   * `source` plays a list as its own source, leaving the queue as it is (docs/plan/04-play.md).
   */
  | {
      kind: 'play';
      queue: Queue;
      next: boolean;
      source: boolean;
      params: Record<string, string[]>;
    }
  /** A handler that starts signing in through the household sign-on: the app's own sign-in. */
  | { kind: 'signIn' };

/** The queues an item plays on: spoken word (books and episodes) or music (docs/plan/04-play.md). */
export const QUEUES = ['spoken', 'music'] as const;
export type Queue = (typeof QUEUES)[number];

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

/** A name the canvas keeps for itself: an element built per item, `$s3`, or a list, `$l1`. */
const own = (node: t.Node, name: string) =>
  name.startsWith('$') ? fail(node, `${name}: a name starting with $ is the canvas's own`) : name;

/** `data.a.b` as `['data', 'a', 'b']`; anything else is refused. */
function memberPath(node: t.Node): string[] {
  if (node.type === 'Identifier') return [own(node, node.name)];
  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
    return [...memberPath(node.object), own(node, node.property.name)];
  }
  return fail(node, `${node.type} is not allowed: only literals and data paths`);
}

/**
 * The names a page's scope already holds, on the canvas board and in the generated web page, so
 * an Each item or a When state never takes one.
 */
const TAKEN = new Set(['data', 'shell', 'slots', 'lists', 'when', 'chrome', 'platform', 'state']);
TAKEN.add('placeholder').add('i').add('ignore').add('layout').add('detected').add('given');
TAKEN.add('navigate');

/** `value`, if it is a plain lower-case name a page may give an Each item or a When state. */
function plainName(value: string, what: string, node: t.Node): string {
  let reserved = false;
  try {
    new Function(value, '');
  } catch {
    reserved = true;
  }
  if (!/^[a-z][A-Za-z0-9]*$/.test(value) || reserved || TAKEN.has(value)) {
    return fail(node, `${what} must be a plain name, not ${JSON.stringify(value)}`);
  }
  return value;
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
    const name = e.openingElement.name;
    if (name.type === 'JSXIdentifier' && name.name === 'Open') return open(e);
    if (name.type === 'JSXIdentifier' && name.name === 'Request') return request(e);
    if (name.type === 'JSXIdentifier' && name.name === 'Play') return play(e);
    if (name.type === 'JSXIdentifier' && name.name === 'SignIn') return signIn(e);
    const tree = element(e);
    if (tree.kind !== 'element') return fail(e, 'Each and When go in children, not in a prop');
    return { kind: 'slot', tree };
  }
  if (e.type === 'JSXFragment') {
    return fail(e, 'a fragment is not allowed: only literals, data paths and one Sonora element');
  }
  return { kind: 'binding', path: memberPath(e) };
}

/**
 * A handler's attributes: `page`, a string literal only an Open takes; a Play's `queue`, a string
 * literal, and `next`, a bare flag; and bound parameters.
 */
function handlerAttrs(node: t.JSXElement, what: string) {
  if (node.children.length > 0) return fail(node, `${what} takes no children`);
  let page: string | { path: string[] } | undefined;
  let queue: string | undefined;
  let next = false;
  let source = false;
  const params: Record<string, string[]> = {};
  for (const attr of node.openingElement.attributes) {
    if (attr.type === 'JSXSpreadAttribute') return fail(attr, 'spread props are not allowed');
    if (attr.name.type !== 'JSXIdentifier') return fail(attr, 'namespaced props are not allowed');
    const name = attr.name.name;
    const value = attr.value;
    if (what === 'Play' && !['ref', 'queue', 'next', 'source'].includes(name)) {
      return fail(attr, `Play takes ref, queue, next and source, not ${name}`);
    }
    if (what === 'Play' && name === 'queue') {
      if (value?.type !== 'StringLiteral')
        return fail(attr, "Play's queue must be a string literal");
      queue = value.value;
      continue;
    }
    if (what === 'Play' && name === 'next') {
      if (value !== null && value !== undefined) return fail(attr, "Play's next is a bare flag");
      next = true;
      continue;
    }
    if (what === 'Play' && name === 'source') {
      if (value !== null && value !== undefined) return fail(attr, "Play's source is a bare flag");
      source = true;
      continue;
    }
    if (name === 'page' && what === 'Open') {
      if (value?.type === 'StringLiteral') page = value.value;
      else if (
        value?.type === 'JSXExpressionContainer' &&
        value.expression.type !== 'JSXEmptyExpression'
      ) {
        page = { path: memberPath(value.expression) };
      } else return fail(attr, "Open's page must be a page id or a data path");
      continue;
    }
    const e = value?.type === 'JSXExpressionContainer' ? value.expression : undefined;
    if (e === undefined || e.type === 'JSXEmptyExpression' || e.type.endsWith('Literal')) {
      return fail(attr, `${what}'s ${name} must be a data path: a parameter is always bound`);
    }
    params[name] = memberPath(e as t.Expression);
  }
  return { page, queue, next, source, params };
}

/**
 * `<Open page="album" ref={release.ref} />`: the page it opens, and its parameters' bindings; or
 * `<Open page={item.page} ref={item.ref} />`, the page named by each item's data.
 */
function open(node: t.JSXElement): PropValue {
  const { page, params } = handlerAttrs(node, 'Open');
  if (page === undefined) return fail(node, 'Open needs page="<page id>" or page={item.page}');
  return { kind: 'open', page, params };
}

/** `<Request ref={book.ref} />`: a request for the item its ref binds. */
function request(node: t.JSXElement): PropValue {
  return { kind: 'request', params: handlerAttrs(node, 'Request').params };
}

/**
 * `<Play ref={episode.ref} queue="spoken" next />`: playing the item its ref binds. `source` plays
 * a list on its own, so it never takes over the queue; played next, a list joins the queue instead.
 */
function play(node: t.JSXElement): PropValue {
  const { queue, next, source, params } = handlerAttrs(node, 'Play');
  if (!QUEUES.includes(queue as Queue)) {
    return fail(node, 'Play needs queue="spoken" or queue="music"');
  }
  if (next && source) return fail(node, 'Play is next or source, not both');
  return { kind: 'play', queue: queue as Queue, next, source, params };
}

/** `<SignIn />`: starting sign-in. Each app knows its own way in, so it takes nothing. */
function signIn(node: t.JSXElement): PropValue {
  if (node.children.length > 0) return fail(node, 'SignIn takes no children');
  const [attr] = node.openingElement.attributes;
  if (attr !== undefined) {
    const name = attr.type === 'JSXAttribute' ? String(attr.name.name) : 'a spread';
    return fail(attr, `SignIn takes nothing, not ${name}`);
  }
  return { kind: 'signIn' };
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
  if (name.name === 'Open') return fail(node, 'Open goes in a handler prop, onClick={<Open … />}');
  if (name.name === 'Request') {
    return fail(node, 'Request goes in a handler prop, onRequest={<Request … />}');
  }
  if (name.name === 'Play') return fail(node, 'Play goes in a handler prop, onPlay={<Play … />}');
  if (name.name === 'SignIn')
    return fail(node, 'SignIn goes in a handler prop, onClick={<SignIn />}');
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
      as: plainName(literalString(props, 'as', node), "Each's as", node),
      children: kids,
    };
  }
  if (name.name === 'When') {
    const state = plainName(literalString(props, 'state', node), "When's state", node);
    return { kind: 'when', line, state, children: kids };
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

/** What an `<Open>` is checked against: the pages, the page's own links and the handler props. */
export interface Opens {
  /** Each page of nav.json by id, with its route's parameter names. */
  pages: Map<string, string[]>;
  /** The page's structure `links`: the only other pages it may open. */
  links: string[];
  /**
   * The page's own id: it may open another item of its own kind, a book's other narration, which
   * its links leave out since a page never links to itself.
   */
  self?: string;
  /** Each component's props that take a handler, `() => void`. */
  handlers: Map<string, Set<string>>;
}

const listed = (words: string[]) =>
  words.length === 1 ? words[0]! : `${words.slice(0, -1).join(', ')} or ${words.at(-1)!}`;

/** The value at `path` below `value`, or undefined. */
function resolve(value: Json, path: string[]): Json {
  let at = value;
  for (const key of path) {
    if (at === null || typeof at !== 'object' || Array.isArray(at) || !Object.hasOwn(at, key))
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
  opens?: Opens,
): string[] {
  const errors: string[] = [];
  const checkOpen = (
    line: number,
    component: string,
    prop: string,
    value: Extract<PropValue, { kind: 'open' }>,
    check: (line: number, path: string[]) => Json[],
  ) => {
    const at = `line ${line}: ${component}.${prop}`;
    const named = typeof value.page === 'string' ? value.page : `{${value.page.path.join('.')}}`;
    if (opens === undefined) {
      errors.push(`${at} opens ${named}, and no navigation map was given to check it`);
      return;
    }
    const handlers = opens.handlers.get(component);
    if (handlers !== undefined && !handlers.has(prop)) {
      errors.push(`${at} takes no handler, so it cannot open a page`);
    }
    // A bound page opens, for each item, the page its data names: every one is checked.
    let targets: string[];
    if (typeof value.page === 'string') targets = [value.page];
    else {
      targets = [];
      for (const v of check(line, value.page.path)) {
        if (typeof v !== 'string' || v === '') {
          errors.push(`${at}: the page (${value.page.path.join('.')}) is not a page id`);
        } else if (!targets.includes(v)) targets.push(v);
      }
    }
    for (const page of targets) {
      const params = opens.pages.get(page);
      if (params === undefined) {
        errors.push(`${at} opens ${page}, which is not a page in nav.json`);
        continue;
      }
      if (!opens.links.includes(page) && page !== opens.self) {
        errors.push(`${at} opens ${page}, which is not in this page's structure links`);
      }
      const given = Object.keys(value.params);
      if ([...given].sort().join() !== [...params].sort().join()) {
        errors.push(`${at} gives ${page} [${given}], and its route takes [${params}]`);
      }
    }
    for (const [name, path] of Object.entries(value.params)) {
      for (const v of check(line, path)) {
        if (typeof v !== 'string' || v === '') {
          errors.push(`${at}: ${named}'s ${name} (${path.join('.')}) is not a non-empty string`);
        }
      }
    }
  };
  /** A Request or a Play: a handler prop, its one parameter a bound ref. */
  const checkItem = (
    line: number,
    component: string,
    prop: string,
    value: Extract<PropValue, { kind: 'request' | 'play' }>,
    check: (line: number, path: string[]) => Json[],
  ) => {
    const at = `line ${line}: ${component}.${prop}`;
    const [noun, verb] = value.kind === 'play' ? ['play', 'play'] : ['request', 'request'];
    const handlers = opens?.handlers.get(component);
    if (handlers !== undefined && !handlers.has(prop)) {
      errors.push(`${at} takes no handler, so it cannot ${verb} an item`);
    }
    const given = Object.keys(value.params);
    if (given.join() !== 'ref') {
      errors.push(`${at} gives a ${noun} [${given}], and a ${noun} takes [ref]`);
      return;
    }
    const path = value.params.ref!;
    for (const v of check(line, path)) {
      if (typeof v !== 'string' || v === '') {
        errors.push(`${at}: the ${noun}'s ref (${path.join('.')}) is not a non-empty string`);
      }
    }
  };
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
        if (scope.has(node.as)) {
          errors.push(`line ${node.line}: Each item ${node.as} hides the outer one of that name`);
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
          const open = node.props['open'];
          if (declared.has('onOpenChange') && open?.kind === 'literal' && open.value === true) {
            errors.push(
              `line ${node.line}: ${node.component} is drawn open; a page starts with its menus closed, and the canvas shows the first open on the page's phone-menu artboard`,
            );
          }
        }
        for (const [prop, value] of Object.entries(node.props)) {
          const found = value.kind === 'binding' ? check(node.line, value.path) : [];
          const choice = choices?.get(node.component)?.get(prop);
          if (value.kind === 'open') {
            checkOpen(node.line, node.component, prop, value, check);
            continue;
          }
          if (value.kind === 'request' || value.kind === 'play') {
            checkItem(node.line, node.component, prop, value, check);
            continue;
          }
          if (value.kind === 'signIn') {
            if (!(opens?.handlers.get(node.component)?.has(prop) ?? true)) {
              errors.push(
                `line ${node.line}: ${node.component}.${prop} takes no handler, so it cannot start sign-in`,
              );
            }
            continue;
          }
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
