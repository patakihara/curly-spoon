/**
 * Sonora's `.d.ts` files read into a props model: one data class per interface, with the enums,
 * sealed interfaces and inline classes its props need, typed the way Kotlin will spell them.
 *
 * Types are walked syntactically, so `ReactNode` is recognised by name even inside a union; the
 * checker only resolves references (imported interfaces, `Pick` and `Omit`). Anything the table
 * below cannot map is refused as `<Component>.<prop>: unsupported type <text>`.
 *
 * Deliberately lossy, and fine for props classes: null and undefined collapse into one nullable
 * type, every `number` is a Float, `string | Obj` keeps only `Obj`, and a prop that only makes
 * sense in a browser (a style, a DOM ref, a DOM event handler) is left out and named as web only.
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
  /** TypeScript's `any`: Kotlin's `Any?`. */
  | { kind: 'unknown' }
  /** `DOMRect`, as Compose's `Rect`. */
  | { kind: 'rect' }
  /** A generated data class, enum or sealed interface. */
  | { kind: 'named'; name: string; args: KType[] }
  | { kind: 'typeParam'; name: string }
  | { kind: 'list'; item: KType }
  | { kind: 'map'; value: KType }
  /** A composable slot, `@Composable () -> Unit`. `ReactNode` is a nullable one. */
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
/** Types only a browser has. A prop that needs one is web only. */
const DOM_TYPES = new Set([
  'ChangeEvent',
  'CSSProperties',
  'DragEvent',
  'Element',
  'Event',
  'FocusEvent',
  'KeyboardEvent',
  'MouseEvent',
  'MutableRefObject',
  'PointerEvent',
  'Ref',
  'RefCallback',
  'RefObject',
  'SyntheticEvent',
  'UIEvent',
]);

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
const nullable = (type: KType): KType =>
  type.kind === 'nullable' || type.kind === 'unknown' ? type : { kind: 'nullable', type };

function containsDom(node: ts.Node): boolean {
  if (ts.isTypeReferenceNode(node)) {
    const name = rightmost(node.typeName);
    if (DOM_TYPES.has(name) || /^HTML\w*Element$/.test(name)) return true;
  }
  return ts.forEachChild(node, (child) => containsDom(child) || undefined) ?? false;
}

/** A function type's parameters, less the optional DOM or `any` ones a callback can ignore. */
const keptParams = (fn: ts.FunctionTypeNode) =>
  fn.parameters.filter(
    (p) =>
      !(
        p.questionToken !== undefined &&
        (p.type === undefined || p.type.kind === ts.SyntaxKind.AnyKeyword || containsDom(p.type))
      ),
  );

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
  /** The interface whose props a callback's literal parameter is matched against. */
  iface: string;
  /** The class the prop belongs to, less any `Props` suffix: the prefix for what it spawns. */
  owner: string;
  prop: string;
  /** The name an inline class, enum or sealed interface made here takes. */
  name: string;
  /** The enum name a literal union here takes, when it differs from `name`. */
  enumName?: string;
  typeParams: Set<string>;
  decls: Decl[];
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
  const interfaceNames = new Set<string>();
  for (const { interfaces } of sources) {
    for (const iface of interfaces) {
      declare(iface.name.text);
      interfaceNames.add(iface.name.text);
    }
  }

  // A prop name with one value set in two or more interfaces shares one enum, named for the prop.
  const valueSets = new Map<string, Map<string, { values: string[]; count: number }>>();
  for (const { interfaces } of sources) {
    for (const iface of interfaces) {
      for (const member of iface.members) {
        if (!ts.isPropertySignature(member) || member.type === undefined) continue;
        const values = literalValues(member.type);
        if (values === undefined) continue;
        const prop = member.name.getText();
        const sets = valueSets.get(prop) ?? new Map();
        valueSets.set(prop, sets);
        const set = sets.get(setKey(values)) ?? { values, count: 0 };
        set.count++;
        sets.set(setKey(values), set);
      }
    }
  }
  const sharedValues = new Map<string, string[]>();
  for (const [prop, sets] of valueSets) {
    const qualifying = [...sets.values()].filter((s) => s.count >= 2);
    // Two value sets both claiming the prop's name stay per component.
    if (qualifying.length === 1) sharedValues.set(prop, qualifying[0]!.values);
  }
  const sharedName = (prop: string, values: string[]) => {
    const shared = sharedValues.get(prop);
    return shared !== undefined && setKey(shared) === setKey(values) ? pascal(prop) : undefined;
  };
  // Each interface's literal props, for its callbacks' literal parameters.
  const interfaceEnums = new Map<
    string,
    { key: string; name: string; values: string[]; shared: boolean }[]
  >();
  for (const { interfaces } of sources) {
    for (const iface of interfaces) {
      const owner = iface.name.text.replace(/Props$/, '');
      const enums = [];
      for (const member of iface.members) {
        if (!ts.isPropertySignature(member) || member.type === undefined) continue;
        const values = literalValues(member.type);
        if (values === undefined) continue;
        const prop = member.name.getText();
        const shared = sharedName(prop, values);
        enums.push({
          key: setKey(values),
          name: shared ?? `${owner}${pascal(prop)}`,
          values: shared !== undefined ? sharedValues.get(prop)! : values,
          shared: shared !== undefined,
        });
      }
      interfaceEnums.set(iface.name.text, enums);
    }
  }

  const shared: EnumDecl[] = [];
  const enums = new Map<string, string>();
  /** The enum `name`, declared in `into` the first time it is asked for. */
  function emitEnum(name: string, values: string[], into: Decl[]): KType {
    const known = enums.get(name);
    if (known === undefined) {
      declare(name);
      enums.set(name, setKey(values));
      into.push({ kind: 'enum', name, values });
    } else if (known !== setKey(values)) {
      throw new Error(`${name} is declared twice, with different values`);
    }
    return { kind: 'named', name, args: [] };
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
      case ts.SyntaxKind.AnyKeyword:
        return { kind: 'unknown' };
    }
    if (isStringLiteral(node) || ts.isUnionTypeNode(node)) {
      const values = literalValues(node);
      if (values !== undefined) {
        const type =
          ctx.enumName !== undefined
            ? emitEnum(ctx.enumName, values, shared)
            : emitEnum(ctx.name, values, ctx.decls);
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

  const itemCtx = (ctx: Ctx): Ctx => {
    const { enumName: _, ...rest } = ctx;
    return { ...rest, name: singular(ctx.name) };
  };

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
        declare(ctx.name);
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
    } else if (rest.length === 2 && rest.some(ts.isFunctionTypeNode) && rest.some(isReactNode)) {
      // A render prop or plain content: the composable function covers both.
      type = mapFn(rest.find(ts.isFunctionTypeNode)!, ctx, true);
    } else {
      return fail(node, ctx);
    }
    return orNull ? nullable(type) : type;
  }

  function mapFn(node: ts.FunctionTypeNode, ctx: Ctx, composable = false): KType {
    const params = keptParams(node).map((p) => {
      if (p.type === undefined) return fail(node, ctx);
      const values = literalValues(p.type);
      let type: KType;
      if (values !== undefined) {
        const own = interfaceEnums.get(ctx.iface)?.find((e) => e.key === setKey(values));
        type =
          own !== undefined
            ? emitEnum(own.name, own.values, own.shared ? shared : ctx.decls)
            : emitEnum(`${ctx.owner}${pascal(ctx.prop)}Arg`, values, ctx.decls);
      } else {
        const { enumName: _, ...rest } = ctx;
        type = mapType(p.type, { ...rest, name: `${ctx.name}${pascal(p.name.getText())}` });
      }
      return p.questionToken !== undefined ? nullable(type) : type;
    });
    const ret = unparen(node.type);
    if (ret.kind === ts.SyntaxKind.VoidKeyword) {
      return { kind: 'fn', params, returns: 'unit', composable };
    }
    if (isReactNode(ret)) return { kind: 'fn', params, returns: 'unit', composable: true };
    return { kind: 'fn', params, returns: mapType(ret, ctx), composable };
  }

  function mapRef(node: ts.TypeReferenceNode, ctx: Ctx): KType {
    const name = rightmost(node.typeName);
    const args = node.typeArguments ?? [];
    if (name === 'ReactNode') return nullable({ kind: 'slot' });
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
    declare(name);
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
    declare(name);
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

  /** Maps each property signature into `decl`, leaving browser-only ones as web only. */
  function fillClass(
    decl: ClassDecl,
    members: ts.NodeArray<ts.TypeElement>,
    ctx: Ctx,
    top = false,
  ) {
    for (const member of members) {
      if (!ts.isPropertySignature(member)) {
        throw new Error(`${ctx.owner}: unsupported member ${member.getText()}`);
      }
      const prop = member.name.getText();
      if (!PROPERTY_NAME.test(prop) || KOTLIN_KEYWORDS.has(prop)) {
        throw new Error(`${ctx.owner}.${prop}: not a Kotlin property name`);
      }
      const here: Ctx = { ...ctx, prop, name: `${ctx.owner}${pascal(prop)}` };
      delete here.enumName;
      if (member.type === undefined) return fail(member, here);
      const type = unparen(member.type);
      const webOnly = ts.isFunctionTypeNode(type)
        ? keptParams(type).some((p) => p.type !== undefined && containsDom(p.type)) ||
          containsDom(type.type)
        : containsDom(type);
      if (webOnly) {
        decl.webOnly.push(prop);
        propMemo.set(member, 'web');
        continue;
      }
      if (top) {
        const values = literalValues(member.type);
        const sharedAs = values === undefined ? undefined : sharedName(prop, values);
        if (sharedAs !== undefined) here.enumName = sharedAs;
      }
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
      fillClass(
        decl,
        iface.members,
        {
          iface: name,
          owner,
          prop: '',
          name: owner,
          typeParams: new Set(typeParams),
          decls,
        },
        true,
      );
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
  shared.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { files, shared };
}
