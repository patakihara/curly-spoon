/**
 * Sonora's `.d.ts` files read into a props model: one data class per interface, with the enums,
 * sealed interfaces and inline classes its props need, typed the way Kotlin will spell them.
 *
 * Types are walked syntactically, so `ReactNode` is recognised by name even inside a union; the
 * checker only resolves references (imported interfaces, `Pick` and `Omit`). What is known maps;
 * anything else is refused as `<Component>.<prop>: unsupported type <text>`, never dropped.
 *
 * Deliberately lossy, and fine for props classes: null and undefined collapse into one nullable
 * type, every `number` is a Float, and `string | Obj` keeps only `Obj`. Only the props on
 * WEB_ONLY_PROPS are left out, named as web only. A callback's web event parameter is dropped,
 * since a Compose callback takes no event: `onClick: (e: MouseEvent) => void` is `() -> Unit`.
 *
 * One string literal value set is one enum, whatever the props holding it are called. Used by one
 * component, it lives in that component's file, named `<Owner><Prop>` for its first property (or
 * `<Owner><Prop>Arg` for a callback parameter when no property holds it). Used by two or more, it
 * is shared, named for the property name most of its uses carry; a tie goes to the longer, more
 * specific name, then the alphabetically first. A name two shared value sets both claim goes to
 * neither: each appends its values (`SizeSmMd`, `SizeSmMdLg`). An enum name Kotlin or Compose
 * already uses takes the `Sonora` prefix (`SonoraColor`).
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { KOTLIN_KEYWORDS } from '@auralis/schema/codegen/kotlin';
import ts from 'typescript';
import type { Component } from './sonora.js';

export type KType =
  | { kind: 'string' }
  | { kind: 'boolean' }
  | { kind: 'float' }
  /** A non-null value of any type: `string | number` keys and ids, compared by equality. */
  | { kind: 'any' }
  /** `DOMRect`, as Compose's `Rect`. */
  | { kind: 'rect' }
  /**
   * A generated data class, enum or sealed interface. `shorthand`: the web also takes a string
   * for it (`string | Obj`), Sonora's shorthand for an item whose key and label are that string.
   */
  | { kind: 'named'; name: string; args: KType[]; shorthand?: true }
  | { kind: 'typeParam'; name: string }
  | { kind: 'list'; item: KType }
  | { kind: 'map'; value: KType }
  /** A composable slot, `@Composable () -> Unit`: `JSX.Element`. `ReactNode` is a nullable one. */
  | { kind: 'slot' }
  | { kind: 'fn'; params: KType[]; returns: KType | 'unit'; composable: boolean }
  | { kind: 'nullable'; type: KType };

export interface Prop {
  name: string;
  doc: string | undefined;
  type: KType;
  optional: boolean;
}

export interface ClassDecl {
  kind: 'class';
  name: string;
  typeParams: string[];
  doc: string | undefined;
  /** Props left out because only a browser can use them. */
  webOnly: string[];
  props: Prop[];
}

export interface EnumDecl {
  kind: 'enum';
  name: string;
  values: string[];
}

export interface SealedDecl {
  kind: 'sealed';
  name: string;
  /** One value class per member type. */
  members: KType[];
}

export type Decl = ClassDecl | EnumDecl | SealedDecl;

export interface PropsModel {
  /** Each component's declarations, by component name, in source order. */
  files: Map<string, Decl[]>;
  /** Enums shared by several components, sorted by name. */
  shared: EnumDecl[];
}

const PROPERTY_NAME = /^[a-z][A-Za-z0-9]*$/;
/** The props only a browser can use: left out, and named as web only. */
const WEB_ONLY_PROPS = new Set(['style', 'className', 'scrollRef']);
/** A browser event. A callback's parameter of one is dropped; anywhere else it is refused. */
const WEB_EVENTS = new Set([
  'AnimationEvent',
  'ChangeEvent',
  'ClipboardEvent',
  'DragEvent',
  'Event',
  'FocusEvent',
  'FormEvent',
  'InputEvent',
  'KeyboardEvent',
  'MouseEvent',
  'PointerEvent',
  'SyntheticEvent',
  'TouchEvent',
  'TransitionEvent',
  'UIEvent',
  'WheelEvent',
]);
/**
 * Names Kotlin's standard library or Compose already give a type. An enum named one takes the
 * `Sonora` prefix; a class named one is refused.
 */
const RESERVED = new Set([
  'Alignment',
  'Any',
  'Arrangement',
  'Array',
  'Boolean',
  'Box',
  'Brush',
  'Button',
  'Byte',
  'Card',
  'Char',
  'Collection',
  'Color',
  'Column',
  'Comparable',
  'Composable',
  'Double',
  'Dp',
  'Enum',
  'Error',
  'Exception',
  'Float',
  'Icon',
  'Image',
  'Int',
  'Iterable',
  'Lazy',
  'List',
  'Long',
  'Map',
  'Modifier',
  'Nothing',
  'Number',
  'Offset',
  'Pair',
  'Rect',
  'Result',
  'Row',
  'Sequence',
  'Set',
  'Shape',
  'Short',
  'Size',
  'State',
  'String',
  'Surface',
  'Text',
  'TextStyle',
  'Triple',
  'Unit',
]);
/** An event handler: `onClick`, `onChange`. */
const isHandler = (prop: string) => /^on[A-Z]/.test(prop);

const pascal = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const singular = (name: string) => (name.endsWith('s') ? name.slice(0, -1) : `${name}Item`);
const unparen = (node: ts.TypeNode): ts.TypeNode =>
  ts.isParenthesizedTypeNode(node) ? unparen(node.type) : node;
const rightmost = (name: ts.EntityName): string =>
  ts.isIdentifier(name) ? name.text : name.right.text;
const isNullish = (node: ts.TypeNode) =>
  node.kind === ts.SyntaxKind.UndefinedKeyword ||
  (ts.isLiteralTypeNode(node) && node.literal.kind === ts.SyntaxKind.NullKeyword);
const isStringLiteral = (node: ts.TypeNode): node is ts.LiteralTypeNode =>
  ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal);
const isReactNode = (node: ts.TypeNode) =>
  ts.isTypeReferenceNode(node) && rightmost(node.typeName) === 'ReactNode';
const isJsxElement = (node: ts.TypeNode) =>
  ts.isTypeReferenceNode(node) &&
  ['JSX.Element', 'React.JSX.Element'].includes(node.typeName.getText());
const isWebEvent = (node: ts.TypeNode) =>
  ts.isTypeReferenceNode(node) && WEB_EVENTS.has(rightmost(node.typeName));
const isAnyOrUnknown = (node: ts.TypeNode) =>
  node.kind === ts.SyntaxKind.AnyKeyword || node.kind === ts.SyntaxKind.UnknownKeyword;
const nullable = (type: KType): KType =>
  type.kind === 'nullable' ? type : { kind: 'nullable', type };

/** The string values of a pure string literal union (nulls aside), else undefined. */
function literalValues(node: ts.TypeNode): string[] | undefined {
  const node_ = unparen(node);
  const parts = (ts.isUnionTypeNode(node_) ? node_.types.map(unparen) : [node_]).filter(
    (t) => !isNullish(t),
  );
  if (parts.length === 0 || !parts.every(isStringLiteral)) return undefined;
  return parts.map((t) => (t.literal as ts.StringLiteral).text);
}
const setKey = (values: string[]) => [...values].sort().join('\0');

/** The cleaned text of a node's last JSDoc comment, or undefined when it has none. */
function docOf(node: ts.Node, sf: ts.SourceFile): string | undefined {
  const docs = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc);
  const doc = docs[docs.length - 1];
  if (doc === undefined) return undefined;
  const raw = sf.text
    .slice(doc.getStart(sf), doc.end)
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '');
  const lines = raw.split('\n').map((line) => line.replace(/^\s*(\* ?)?/, '').trimEnd());
  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.length === 0 ? undefined : lines.join('\n');
}

interface Ctx {
  /** The component whose file this lands in. */
  file: string;
  /** The class the prop belongs to, less any `Props` suffix: the prefix for what it spawns. */
  owner: string;
  prop: string;
  /** The callback parameter being mapped, if any. */
  param?: string;
  /** The name an inline class, enum or sealed interface made here takes. */
  name: string;
  typeParams: Set<string>;
  decls: Decl[];
}

/** One string literal value set, and every place it is used. */
interface EnumGroup {
  decl: EnumDecl;
  /** The one type object every use returns, named once all uses are known. */
  type: { kind: 'named'; name: string; args: KType[] };
  uses: { local: string; prop: string; param: boolean; values: string[] }[];
  /** Each component using it, with the declarations it was placed in. */
  files: Map<string, Decl[]>;
}

export function readProps(components: Component[]): PropsModel {
  const require = createRequire(import.meta.url);
  const reactTypes = join(dirname(require.resolve('@types/react/package.json')), 'index.d.ts');
  const program = ts.createProgram({
    rootNames: [reactTypes, ...components.map((c) => c.dts)],
    options: {
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      paths: { react: [reactTypes] },
      allowUmdGlobalAccess: true,
      types: [],
    },
  });
  // Diagnostics are not read: React 19 has no global JSX, so `JSX.Element` returns are errors
  // that do not touch the props.
  const checker = program.getTypeChecker();

  const sources = components.map((component) => {
    const sf = program.getSourceFile(component.dts);
    if (sf === undefined) throw new Error(`${component.dts}: not in the program`);
    return { component, sf, interfaces: sf.statements.filter(ts.isInterfaceDeclaration) };
  });

  const taken = new Set<string>();
  const declare = (name: string) => {
    if (taken.has(name)) throw new Error(`${name} is declared twice`);
    taken.add(name);
  };
  const declareClass = (name: string) => {
    if (RESERVED.has(name)) throw new Error(`${name} is a Kotlin or Compose type name`);
    declare(name);
  };
  const interfaceNames = new Set<string>();
  for (const { interfaces } of sources) {
    for (const iface of interfaces) {
      declareClass(iface.name.text);
      interfaceNames.add(iface.name.text);
    }
  }

  const groups = new Map<string, EnumGroup>();
  /** The enum for a literal value set used here; named once every use is known. */
  function useEnum(values: string[], ctx: Ctx): KType {
    const key = setKey(values);
    let group = groups.get(key);
    if (group === undefined) {
      group = {
        decl: { kind: 'enum', name: '', values },
        type: { kind: 'named', name: '', args: [] },
        uses: [],
        files: new Map(),
      };
      groups.set(key, group);
    }
    group.uses.push(
      ctx.param !== undefined
        ? { local: `${ctx.owner}${pascal(ctx.prop)}Arg`, prop: ctx.param, param: true, values }
        : { local: ctx.name, prop: ctx.prop, param: false, values },
    );
    if (!group.files.has(ctx.file)) {
      group.files.set(ctx.file, ctx.decls);
      ctx.decls.push(group.decl);
    }
    return group.type;
  }

  const deferred: (() => void)[] = [];
  const propMemo = new Map<ts.PropertySignature, Prop | 'web'>();

  function fail(node: ts.Node, ctx: Ctx): never {
    throw new Error(
      `${ctx.owner}.${ctx.prop}: unsupported type ${node.getText().replace(/\s+/g, ' ')}`,
    );
  }

  function mapType(node_: ts.TypeNode, ctx: Ctx): KType {
    const node = unparen(node_);
    switch (node.kind) {
      case ts.SyntaxKind.StringKeyword:
        return { kind: 'string' };
      case ts.SyntaxKind.BooleanKeyword:
        return { kind: 'boolean' };
      case ts.SyntaxKind.NumberKeyword:
        return { kind: 'float' };
    }
    if (isStringLiteral(node) || ts.isUnionTypeNode(node)) {
      const values = literalValues(node);
      if (values !== undefined) {
        const type = useEnum(values, ctx);
        return ts.isUnionTypeNode(node) && node.types.map(unparen).some(isNullish)
          ? nullable(type)
          : type;
      }
    }
    if (ts.isUnionTypeNode(node)) return mapUnion(node, ctx);
    if (ts.isArrayTypeNode(node)) {
      return { kind: 'list', item: mapType(node.elementType, itemCtx(ctx)) };
    }
    if (ts.isTypeLiteralNode(node)) return inlineClass(node.members, ctx);
    if (ts.isFunctionTypeNode(node)) return mapFn(node, ctx);
    if (ts.isTypeReferenceNode(node)) return mapRef(node, ctx);
    return fail(node, ctx);
  }

  const itemCtx = (ctx: Ctx): Ctx => ({ ...ctx, name: singular(ctx.name) });

  function mapUnion(node: ts.UnionTypeNode, ctx: Ctx): KType {
    const parts = node.types.map(unparen);
    const rest = parts.filter((t) => !isNullish(t));
    const orNull = rest.length !== parts.length;
    const kinds = rest.map((t) => t.kind);
    const primitive = (k: ts.SyntaxKind) =>
      k === ts.SyntaxKind.StringKeyword ||
      k === ts.SyntaxKind.NumberKeyword ||
      k === ts.SyntaxKind.BooleanKeyword;
    let type: KType;
    if (rest.length === 1) {
      type = mapType(rest[0]!, ctx);
    } else if (
      kinds.includes(ts.SyntaxKind.StringKeyword) &&
      rest.every((t) => t.kind === ts.SyntaxKind.StringKeyword || isStringLiteral(t))
    ) {
      // 'now' | 'queue' | string: any string at all.
      type = { kind: 'string' };
    } else if (kinds.every(primitive) && new Set(kinds).size === kinds.length) {
      if (
        kinds.length === 2 &&
        kinds.includes(ts.SyntaxKind.StringKeyword) &&
        kinds.includes(ts.SyntaxKind.NumberKeyword)
      ) {
        type = { kind: 'any' };
      } else {
        declareClass(ctx.name);
        const members = rest.map((t) => mapType(t, ctx));
        ctx.decls.push({ kind: 'sealed', name: ctx.name, members });
        type = { kind: 'named', name: ctx.name, args: [] };
      }
    } else if (
      rest.length === 2 &&
      kinds.includes(ts.SyntaxKind.StringKeyword) &&
      rest.some((t) => ts.isTypeReferenceNode(t) || ts.isTypeLiteralNode(t))
    ) {
      // string | Obj: the string is web shorthand for the object.
      type = mapType(
        rest.find((t) => t.kind !== ts.SyntaxKind.StringKeyword)!,
        ctx,
      );
      if (type.kind === 'named') type = { ...type, shorthand: true };
    } else if (rest.length === 2 && rest.some(ts.isFunctionTypeNode) && rest.some(isReactNode)) {
      // A render prop or plain content: the composable function covers both.
      type = mapFn(rest.find(ts.isFunctionTypeNode)!, ctx, true);
    } else {
      return fail(node, ctx);
    }
    return orNull ? nullable(type) : type;
  }

  /**
   * A function type. A web event parameter is dropped, and so is a handler's `any` one, which is
   * its web event too. A rest parameter is refused.
   */
  function mapFn(node: ts.FunctionTypeNode, ctx: Ctx, composable = false): KType {
    const params: KType[] = [];
    for (const p of node.parameters) {
      if (p.dotDotDotToken !== undefined) {
        throw new Error(`${ctx.owner}.${ctx.prop}: unsupported rest parameter ${p.getText()}`);
      }
      if (p.type === undefined) return fail(node, ctx);
      const param = p.name.getText();
      const pType = unparen(p.type);
      if (isWebEvent(pType)) continue;
      if (isAnyOrUnknown(pType) && isHandler(ctx.prop)) continue;
      const type = mapType(p.type, { ...ctx, param, name: `${ctx.name}${pascal(param)}` });
      params.push(p.questionToken !== undefined ? nullable(type) : type);
    }
    const ret = unparen(node.type);
    if (ret.kind === ts.SyntaxKind.VoidKeyword) {
      return { kind: 'fn', params, returns: 'unit', composable };
    }
    if (isReactNode(ret) || isJsxElement(ret)) {
      return { kind: 'fn', params, returns: 'unit', composable: true };
    }
    return { kind: 'fn', params, returns: mapType(ret, ctx), composable };
  }

  function mapRef(node: ts.TypeReferenceNode, ctx: Ctx): KType {
    const name = rightmost(node.typeName);
    const args = node.typeArguments ?? [];
    if (name === 'ReactNode') return nullable({ kind: 'slot' });
    if (isJsxElement(node)) return { kind: 'slot' };
    if (name === 'DOMRect' && args.length === 0) return { kind: 'rect' };
    if (name === 'Array' && args.length === 1) {
      return { kind: 'list', item: mapType(args[0]!, itemCtx(ctx)) };
    }
    if (name === 'Record' && args.length === 2 && args[0]!.kind === ts.SyntaxKind.StringKeyword) {
      return { kind: 'map', value: mapType(args[1]!, itemCtx(ctx)) };
    }
    if ((name === 'Pick' || name === 'Omit') && args.length === 2) return pickClass(node, ctx);
    if (ctx.typeParams.has(name) && args.length === 0) return { kind: 'typeParam', name };
    let symbol = checker.getSymbolAtLocation(node.typeName);
    if (symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias) {
      symbol = checker.getAliasedSymbol(symbol);
    }
    const iface = symbol?.declarations?.find(ts.isInterfaceDeclaration);
    if (iface !== undefined && interfaceNames.has(iface.name.text)) {
      return { kind: 'named', name: iface.name.text, args: args.map((a) => mapType(a, ctx)) };
    }
    return fail(node, ctx);
  }

  function inlineClass(members: ts.NodeArray<ts.TypeElement>, ctx: Ctx): KType {
    const name = ctx.name;
    declareClass(name);
    const decl: ClassDecl = {
      kind: 'class',
      name,
      typeParams: [],
      doc: undefined,
      webOnly: [],
      props: [],
    };
    const at = ctx.decls.length;
    fillClass(decl, members, { ...ctx, owner: name });
    ctx.decls.splice(at, 0, decl);
    return { kind: 'named', name, args: [] };
  }

  /** A `Pick` or `Omit` becomes a class of the resolved properties, once every interface is read. */
  function pickClass(node: ts.TypeReferenceNode, ctx: Ctx): KType {
    const name = ctx.name;
    declareClass(name);
    const decl: ClassDecl = {
      kind: 'class',
      name,
      typeParams: [],
      doc: undefined,
      webOnly: [],
      props: [],
    };
    ctx.decls.push(decl);
    deferred.push(() => {
      const signatures = checker
        .getPropertiesOfType(checker.getTypeFromTypeNode(node))
        .map((symbol) => symbol.declarations?.find(ts.isPropertySignature))
        .map((signature) => {
          if (signature === undefined || !propMemo.has(signature)) return fail(node, ctx);
          return signature;
        })
        .sort((a, b) => a.pos - b.pos);
      for (const signature of signatures) {
        const prop = propMemo.get(signature)!;
        if (prop === 'web') decl.webOnly.push(signature.name.getText());
        else decl.props.push(prop);
      }
    });
    return { kind: 'named', name, args: [] };
  }

  /** Maps each property signature into `decl`, leaving WEB_ONLY_PROPS out as web only. */
  function fillClass(decl: ClassDecl, members: ts.NodeArray<ts.TypeElement>, ctx: Ctx) {
    for (const member of members) {
      if (!ts.isPropertySignature(member)) {
        throw new Error(`${ctx.owner}: unsupported member ${member.getText()}`);
      }
      const prop = member.name.getText();
      if (!PROPERTY_NAME.test(prop) || KOTLIN_KEYWORDS.has(prop)) {
        throw new Error(`${ctx.owner}.${prop}: not a Kotlin property name`);
      }
      const here: Ctx = { ...ctx, prop, name: `${ctx.owner}${pascal(prop)}` };
      delete here.param;
      if (WEB_ONLY_PROPS.has(prop)) {
        decl.webOnly.push(prop);
        propMemo.set(member, 'web');
        continue;
      }
      if (member.type === undefined) return fail(member, here);
      const mapped: Prop = {
        name: prop,
        doc: docOf(member, member.getSourceFile()),
        type: mapType(member.type, here),
        optional: member.questionToken !== undefined,
      };
      decl.props.push(mapped);
      propMemo.set(member, mapped);
    }
  }

  const files = new Map<string, Decl[]>();
  for (const { component, sf, interfaces } of sources) {
    const decls: Decl[] = [];
    for (const iface of interfaces) {
      const name = iface.name.text;
      const typeParams = (iface.typeParameters ?? []).map((p) => p.name.text);
      const decl: ClassDecl = {
        kind: 'class',
        name,
        typeParams,
        doc: docOf(iface, sf),
        webOnly: [],
        props: [],
      };
      if (iface.heritageClauses !== undefined) {
        throw new Error(`${name}: extends is not supported`);
      }
      const at = decls.length;
      const owner = name.replace(/Props$/, '');
      fillClass(decl, iface.members, {
        file: component.name,
        owner,
        prop: '',
        name: owner,
        typeParams: new Set(typeParams),
        decls,
      });
      decls.splice(at, 0, decl);
    }
    files.set(component.name, decls);
  }
  for (const run of deferred) run();
  for (const decls of files.values()) {
    for (const decl of decls) {
      if (decl.kind === 'class' && decl.props.length === 0) {
        throw new Error(`${decl.name}: no props Kotlin can hold`);
      }
    }
  }
  const shared = nameEnums([...groups.values()], declare);
  return { files, shared };
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
const pascalWords = (value: string) =>
  value
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w !== '')
    .map(pascal)
    .join('');

/**
 * Names every enum group by the rule in this file's header, takes shared ones out of their
 * components' files and returns them, sorted by name.
 */
function nameEnums(groups: EnumGroup[], declare: (name: string) => void): EnumDecl[] {
  const unreserved = (name: string) => (RESERVED.has(name) ? `Sonora${name}` : name);
  const setName = (group: EnumGroup, name: string) => {
    group.decl.name = name;
    group.type.name = name;
    declare(name);
  };
  const shared: EnumGroup[] = [];
  for (const group of groups) {
    // The values as a property first spelled them, else as the first use did.
    const first = group.uses.find((u) => !u.param) ?? group.uses[0]!;
    group.decl.values = first.values;
    if (group.files.size === 1) setName(group, unreserved(first.local));
    else shared.push(group);
  }

  const claims = new Map<string, EnumGroup[]>();
  for (const group of shared) {
    const props = group.uses.filter((u) => !u.param);
    const counts = new Map<string, number>();
    for (const use of props.length > 0 ? props : group.uses) {
      counts.set(use.prop, (counts.get(use.prop) ?? 0) + 1);
    }
    const [best] = [...counts].sort(
      ([a, m], [b, n]) => n - m || b.length - a.length || (a < b ? -1 : a > b ? 1 : 0),
    );
    const name = pascal(best![0]);
    claims.set(name, [...(claims.get(name) ?? []), group]);
  }
  for (const [name, claimants] of claims) {
    for (const group of claimants) {
      const suffix = claimants.length > 1 ? group.decl.values.map(pascalWords).join('') : '';
      setName(group, unreserved(`${name}${suffix}`));
    }
  }

  for (const group of shared) {
    for (const decls of group.files.values()) decls.splice(decls.indexOf(group.decl), 1);
  }
  return shared.map((g) => g.decl).sort(byName);
}
