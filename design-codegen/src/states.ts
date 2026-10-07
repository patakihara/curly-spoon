/**
 * Material's states on Sonora's controls, read off the component sources. Every element that
 * takes an action (`onClick`, `onChange`, `onKeyDown`) must sit in a state host: itself or an
 * enclosing element whose class names `sn-int`, drawing `NS().StateLayer` inside it. An
 * `aria-hidden` element is not a control (a scrim that closes a sheet) and is exempt.
 */
import { parse } from '@babel/parser';
import type * as t from '@babel/types';

const ACTIONS = new Set(['onClick', 'onChange', 'onKeyDown']);

const attr = (el: t.JSXElement, name: string) =>
  el.openingElement.attributes.find(
    (a): a is t.JSXAttribute => a.type === 'JSXAttribute' && a.name.name === name,
  );

/** Whether a className value mentions `sn-int`: a literal, or any string inside an expression. */
function isHost(el: t.JSXElement, source: string): boolean {
  // shared.js's `press(...)`, spread onto the element, makes it a host: it sets the class.
  const pressed = el.openingElement.attributes.some(
    (a) =>
      a.type === 'JSXSpreadAttribute' &&
      a.argument.type === 'CallExpression' &&
      a.argument.callee.type === 'Identifier' &&
      a.argument.callee.name === 'press',
  );
  if (pressed) return true;
  const value = attr(el, 'className')?.value;
  if (value == null) return false;
  return /\bsn-int\b/.test(source.slice(value.start!, value.end!));
}

const intrinsic = (el: t.JSXElement) =>
  el.openingElement.name.type === 'JSXIdentifier' && /^[a-z]/.test(el.openingElement.name.name);

/** The local names bound to `NS().StateLayer`, as `X = NS().StateLayer` or `{ StateLayer } = NS()`. */
function stateLayerNames(program: t.Program): Set<string> {
  const names = new Set<string>();
  const visit = (node: t.Node | null | undefined): void => {
    if (node == null || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.init != null) {
      const init = node.init;
      const isNs = (n: t.Node) =>
        n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'NS';
      if (
        init.type === 'MemberExpression' &&
        isNs(init.object) &&
        init.property.type === 'Identifier' &&
        init.property.name === 'StateLayer' &&
        node.id.type === 'Identifier'
      ) {
        names.add(node.id.name);
      }
      if (isNs(init) && node.id.type === 'ObjectPattern') {
        for (const p of node.id.properties) {
          if (
            p.type === 'ObjectProperty' &&
            p.key.type === 'Identifier' &&
            p.key.name === 'StateLayer' &&
            p.value.type === 'Identifier'
          ) {
            names.add(p.value.name);
          }
        }
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const child = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(child)) child.forEach((c) => visit(c as t.Node));
      else if (child !== null && typeof child === 'object') visit(child as t.Node);
    }
  };
  visit(program);
  return names;
}

/** Whether `node`'s subtree draws one of `layers`. */
function drawsLayer(node: t.Node, layers: ReadonlySet<string>): boolean {
  let found = false;
  const visit = (n: t.Node | null | undefined): void => {
    if (found || n == null || typeof n !== 'object') return;
    if (
      n.type === 'JSXOpeningElement' &&
      n.name.type === 'JSXIdentifier' &&
      layers.has(n.name.name)
    ) {
      found = true;
      return;
    }
    for (const key of Object.keys(n)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const child = (n as unknown as Record<string, unknown>)[key];
      if (Array.isArray(child)) child.forEach((c) => visit(c as t.Node));
      else if (child !== null && typeof child === 'object') visit(child as t.Node);
    }
  };
  visit(node);
  return found;
}

/**
 * The elements of one Sonora `.jsx` that take an action outside a state host, each as
 * `<tag onX> (line N)`. Empty when every control draws its state layer.
 */
export function unlayeredControls(source: string): string[] {
  const program = parse(source, { sourceType: 'module', plugins: ['jsx'] }).program;
  const layers = stateLayerNames(program);
  const found: string[] = [];
  const visit = (node: t.Node | null | undefined, hosts: t.JSXElement[]): void => {
    if (node == null || typeof node !== 'object') return;
    let inner = hosts;
    if (node.type === 'JSXElement' && intrinsic(node)) {
      if (isHost(node, source)) inner = [...hosts, node];
      const actions = node.openingElement.attributes
        .filter((a): a is t.JSXAttribute => a.type === 'JSXAttribute')
        .map((a) => String(a.name.name))
        .filter((n) => ACTIONS.has(n));
      const hidden = attr(node, 'aria-hidden') !== undefined;
      const host = inner[inner.length - 1];
      if (actions.length > 0 && !hidden && (host === undefined || !drawsLayer(host, layers))) {
        const tag = (node.openingElement.name as t.JSXIdentifier).name;
        found.push(`<${tag} ${actions.join(' ')}> (line ${node.loc?.start.line ?? '?'})`);
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      const child = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(child)) child.forEach((c) => visit(c as t.Node, inner));
      else if (child !== null && typeof child === 'object') visit(child as t.Node, inner);
    }
  };
  visit(program, []);
  return found;
}
