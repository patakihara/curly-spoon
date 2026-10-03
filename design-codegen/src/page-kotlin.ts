/**
 * A page tree as an Android page: `generated/pages/<Id>Page.kt`, a composable calling Sonora's
 * composables by name, each with its generated `<Name>Props`, inside the phone's shell. The
 * placeholder is inlined as literals, typed by the props model, as the canvas's artboards show
 * it: an `<Each>` is one call per item, a `<When>` only the full state. `<Open>` navigates to the
 * typed route, `<Play>`, `<Request>` and `<SignIn />` call the actions the app injects, and the
 * shell's own controls close the page, switch destinations and open the player, as nav.json says.
 */
import { enumConstant } from '@auralis/schema/codegen/kotlin';
import { pascal, typeText } from './kotlin.js';
import { componentName, type Nav, type NavPage } from './nav.js';
import { kotlinString, routeCall } from './nav-kotlin.js';
import {
  APP_NOTE,
  KOTLIN_NAV_PACKAGE,
  KOTLIN_PAGES_PACKAGE,
  KOTLIN_PACKAGE,
  KOTLIN_SONORA_PACKAGE,
} from './outputs.js';
import type { PageTree, PropValue } from './page.js';
import {
  closeAction,
  shellHandlers,
  type ShellAction,
  type ShellHandlers,
} from './shell-handlers.js';
import type { ClassDecl, EnumDecl, KType, PropsModel, SealedDecl } from './props.js';
import {
  chrome,
  framePage,
  framed,
  playerTab,
  playerTree,
  shellData,
  type ShellFile,
} from './shell.js';

/** The shell a page is generated into: the navigation map, shell.json and the page's own entry. */
export interface KotlinShell {
  nav: Nav;
  shell: ShellFile;
  page: NavPage;
  /** Now Playing's page, which a side panel would show; the phone has none, so it goes unused. */
  now?: PageTree[];
}

/** Kotlin as a small tree, printed on one line where it fits and broken where it does not. */
export type Expr =
  | { t: 'raw'; text: string }
  | { t: 'call'; fn: string; args: [string | null, Expr][] }
  | { t: 'lambda'; params: string; body: Expr[] };

export const raw = (text: string): Expr => ({ t: 'raw', text });
export const call = (fn: string, args: [string | null, Expr][]): Expr => ({ t: 'call', fn, args });
export const lambda = (body: Expr[], params = ''): Expr => ({ t: 'lambda', params, body });

const WIDTH = 100;
export const STEP = '    ';

function flat(e: Expr): string | undefined {
  if (e.t === 'raw') return e.text;
  if (e.t === 'call') {
    const args = e.args.map(([name, v]) => {
      const text = flat(v);
      return text === undefined ? undefined : name === null ? text : `${name} = ${text}`;
    });
    return args.includes(undefined) ? undefined : `${e.fn}(${args.join(', ')})`;
  }
  const head = e.params === '' ? '' : `${e.params} -> `;
  if (e.body.length === 0) return e.params === '' ? '{}' : `{ ${e.params} -> }`;
  if (e.body.length > 1) return undefined;
  const body = flat(e.body[0]!);
  return body === undefined ? undefined : `{ ${head}${body} }`;
}

/** `e` starting at column `col`, its later lines indented from `indent`. */
export function print(e: Expr, indent: string, col: number): string {
  const line = flat(e);
  if (line !== undefined && col + line.length <= WIDTH) return line;
  const inner = indent + STEP;
  if (e.t === 'raw') return e.text;
  if (e.t === 'call') {
    const args = e.args.map(([name, v]) => {
      const lead = name === null ? '' : `${name} = `;
      return `${inner}${lead}${print(v, inner, inner.length + lead.length)},`;
    });
    return `${e.fn}(\n${args.join('\n')}\n${indent})`;
  }
  const head = e.params === '' ? '{' : `{ ${e.params} ->`;
  const body = e.body.map((s) => `${inner}${print(s, inner, inner.length)}`);
  return `${head}\n${body.join('\n')}\n${indent}}`;
}

/** The props model's declarations by name: data classes, enums and sealed interfaces. */
export interface Decls {
  classes: Map<string, ClassDecl>;
  enums: Map<string, EnumDecl>;
  sealed: Map<string, SealedDecl>;
}

export function declsOf(model: PropsModel): Decls {
  const decls: Decls = { classes: new Map(), enums: new Map(), sealed: new Map() };
  for (const e of model.shared) decls.enums.set(e.name, e);
  for (const list of model.files.values()) {
    for (const d of list) {
      if (d.kind === 'class') decls.classes.set(d.name, d);
      else if (d.kind === 'enum') decls.enums.set(d.name, d);
      else decls.sealed.set(d.name, d);
    }
  }
  return decls;
}

const described = (v: unknown) => JSON.stringify(v) ?? String(v);

export const isSlot = (type: KType): boolean =>
  type.kind === 'slot' || (type.kind === 'nullable' && isSlot(type.type));

export function handlerArity(type: KType): number | undefined {
  if (type.kind === 'nullable') return handlerArity(type.type);
  return type.kind === 'fn' && !type.composable ? type.params.length : undefined;
}

type Scope = Map<string, unknown>;

/** The fields a string given for an item stands for, where the item has them. */
const SHORTHAND = ['key', 'label', 'title'];
const isString = (type: KType): boolean =>
  type.kind === 'string' || (type.kind === 'nullable' && isString(type.type));

/**
 * Placeholder values as Kotlin literals, typed by the props model: the data classes, enums and
 * sealed interfaces they build, and whether a slot drew plain text, are kept for the imports.
 */
export class KotlinValues {
  readonly types = new Set<string>();
  text = false;

  constructor(
    protected readonly id: string,
    protected readonly decls: Decls,
  ) {}

  fail(message: string): never {
    throw new Error(`${this.id}: ${message}`);
  }

  /** The Kotlin literal of `value` as `type`, refusing anything the type cannot hold. */
  value(type: KType, value: unknown, where: string): Expr {
    const wrong = (): never =>
      this.fail(`${where} takes ${typeText(type)}, not ${described(value)}`);
    switch (type.kind) {
      case 'nullable':
        return value === null ? raw('null') : this.value(type.type, value, where);
      case 'string':
        return typeof value === 'string' ? raw(kotlinString(value)) : wrong();
      case 'boolean':
        return typeof value === 'boolean' ? raw(String(value)) : wrong();
      case 'float':
        return typeof value === 'number' && Number.isFinite(value) ? raw(`${value}f`) : wrong();
      case 'any':
        if (typeof value === 'string') return raw(kotlinString(value));
        if (typeof value === 'number' || typeof value === 'boolean') return raw(String(value));
        return wrong();
      case 'list':
        if (!Array.isArray(value)) return wrong();
        return call(
          'listOf',
          value.map((item, i) => [null, this.value(type.item, item, `${where}[${i}]`)]),
        );
      case 'map': {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) return wrong();
        const pairs = Object.entries(value).map(([k, v]): [null, Expr] => {
          const text = flat(this.value(type.value, v, `${where}.${k}`));
          if (text === undefined) return this.fail(`${where}.${k} is not a plain value`);
          return [null, raw(`${kotlinString(k)} to ${text}`)];
        });
        return call('mapOf', pairs);
      }
      case 'slot':
        if (typeof value === 'string' || typeof value === 'number') {
          this.text = true;
          return lambda([call('BasicText', [[null, raw(kotlinString(String(value)))]])]);
        }
        return wrong();
      case 'named':
        return this.named(type, value, where, wrong);
      default:
        return wrong();
    }
  }

  named(
    type: Extract<KType, { kind: 'named' }>,
    value: unknown,
    where: string,
    wrong: () => never,
  ): Expr {
    const e = this.decls.enums.get(type.name);
    if (e !== undefined) {
      if (typeof value !== 'string' || !e.values.includes(value)) return wrong();
      this.types.add(e.name);
      return raw(`${e.name}.${enumConstant(value, e.name)}`);
    }
    const c = this.decls.classes.get(type.name);
    if (c !== undefined && typeof value === 'string' && type.shorthand === true) {
      // Sonora's shorthand, as its components read it: the string is the item's key and its label
      // (ButtonGroup, TabBar) or its title (FrontLayerHeader's sections).
      const named = SHORTHAND.filter((f) => c.props.some((p) => p.name === f && isString(p.type)));
      if (named.length === 0) return wrong();
      return this.construct(c, Object.fromEntries(named.map((f) => [f, value])), where);
    }
    if (c !== undefined) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return wrong();
      return this.construct(c, value as Record<string, unknown>, where);
    }
    const s = this.decls.sealed.get(type.name);
    if (s !== undefined) {
      const member = s.members.find((m) => this.fits(m, value));
      if (member === undefined) return wrong();
      this.types.add(s.name);
      return call(`${s.name}.Of${pascal(typeText(member))}`, [
        [null, this.value(member, value, where)],
      ]);
    }
    return this.fail(`${where}: ${type.name} is not in the props model`);
  }

  fits(type: KType, value: unknown): boolean {
    if (type.kind === 'string') return typeof value === 'string';
    if (type.kind === 'float') return typeof value === 'number';
    if (type.kind === 'boolean') return typeof value === 'boolean';
    if (type.kind === 'list') return Array.isArray(value);
    if (type.kind === 'named') {
      if (this.decls.enums.has(type.name)) return typeof value === 'string';
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    }
    return false;
  }

  /** A data class from a placeholder object: the fields it declares, the rest left out. */
  construct(c: ClassDecl, value: Record<string, unknown>, where: string): Expr {
    if (c.typeParams.length > 0) return this.fail(`${where}: ${c.name} is generic, not yet drawn`);
    this.types.add(c.name);
    const args: [string, Expr][] = [];
    for (const p of c.props) {
      if (Object.hasOwn(value, p.name))
        args.push([p.name, this.value(p.type, value[p.name], `${where}.${p.name}`)]);
      else if (!p.optional) {
        if (p.type.kind === 'nullable') args.push([p.name, raw('null')]);
        else return this.fail(`${where} needs ${p.name}`);
      }
    }
    return call(c.name, args);
  }
}

class PageWriter extends KotlinValues {
  readonly composables = new Set<string>();
  readonly nav = new Set<string>();

  constructor(
    id: string,
    decls: Decls,
    private readonly pages: Map<string, NavPage>,
    /** Kotlin handlers the shell's own controls take on Android, by the element they belong to. */
    private readonly shellHandlers: Map<PageTree, Record<string, Expr>>,
  ) {
    super(id, decls);
  }

  resolve(path: string[], scope: Scope): unknown {
    const [root = '', ...rest] = path;
    if (!scope.has(root))
      return this.fail(`${path.join('.')} binds ${root}, which is not in scope`);
    let at = scope.get(root);
    for (const key of rest) {
      if (at === null || typeof at !== 'object' || !Object.hasOwn(at, key))
        return this.fail(`${path.join('.')} is not in the placeholder`);
      at = (at as Record<string, unknown>)[key];
    }
    return at;
  }

  /** A handler node as the lambda a Kotlin handler prop takes. */
  handler(
    value: Exclude<PropValue, { kind: 'literal' | 'binding' | 'slot' | 'request' }>,
    scope: Scope,
  ): Expr {
    const bound = (params: Record<string, string[]>) =>
      Object.fromEntries(
        Object.entries(params).map(([k, path]) => [k, String(this.resolve(path, scope))]),
      );
    switch (value.kind) {
      case 'open': {
        const id =
          typeof value.page === 'string'
            ? value.page
            : String(this.resolve(value.page.path, scope));
        const page = this.pages.get(id);
        if (page === undefined) return this.fail(`opens ${id}, which is not an Android page`);
        this.nav.add('Route');
        return raw(`navController.navigate(${routeCall(page, bound(value.params))})`);
      }
      case 'play': {
        this.nav.add('PlayQueue').add('PlayMode');
        const mode = value.next ? 'NEXT' : value.source ? 'SOURCE' : 'NOW';
        const ref = kotlinString(bound(value.params).ref!);
        return raw(
          `actions.onPlay(${ref}, PlayQueue.${value.queue.toUpperCase()}, PlayMode.${mode})`,
        );
      }
      case 'signIn':
        return raw('actions.onSignIn()');
    }
  }

  /** The prop's value, or nothing when the prop is left out. */
  prop(
    component: string,
    name: string,
    type: KType,
    value: PropValue,
    scope: Scope,
  ): Expr | undefined {
    const where = `${component}.${name}`;
    switch (value.kind) {
      // The app has no way to make a request yet. A handler doing nothing would draw a dead control
      // as enabled, so the prop is left out and Sonora draws the control disabled.
      case 'request':
        return undefined;
      case 'literal':
        return this.value(type, value.value, where);
      case 'binding':
        return this.value(type, this.resolve(value.path, scope), where);
      case 'slot':
        if (!isSlot(type)) return this.fail(`${where} takes no element`);
        return lambda(this.render(value.tree, scope));
      default: {
        const arity = handlerArity(type);
        if (arity === undefined) return this.fail(`${where} takes no handler`);
        const params = Array.from({ length: arity }, () => '_').join(', ');
        return lambda([this.handler(value, scope)], params);
      }
    }
  }

  element(tree: Extract<PageTree, { kind: 'element' }>, scope: Scope): Expr {
    const c = this.decls.classes.get(`${tree.component}Props`);
    if (c === undefined) return this.fail(`${tree.component} is not a Sonora component`);
    this.composables.add(tree.component);
    this.types.add(c.name);
    const own = this.shellHandlers.get(tree) ?? {};
    const given = new Set([...Object.keys(tree.props), ...Object.keys(own)]);
    for (const name of given) {
      if (!c.props.some((p) => p.name === name))
        this.fail(`${tree.component} has no prop ${name} on Android`);
    }
    const args: [string, Expr][] = [];
    let children: [string, Expr] | undefined;
    for (const p of c.props) {
      const value = tree.props[p.name];
      let expr: Expr | undefined;
      if (own[p.name] !== undefined) expr = own[p.name];
      else if (value !== undefined) expr = this.prop(tree.component, p.name, p.type, value, scope);
      else if (p.name === 'children' && tree.children.length > 0) {
        expr = lambda(tree.children.flatMap((child) => this.render(child, scope)));
      } else if (p.name === 'platform')
        expr = this.value(p.type, 'mobile', `${tree.component}.platform`);
      else if (!p.optional) {
        if (p.type.kind === 'nullable') expr = raw('null');
        else return this.fail(`${tree.component} needs ${p.name}`);
      }
      if (expr === undefined) continue;
      if (p.name === 'children') children = [p.name, expr];
      else args.push([p.name, expr]);
    }
    if (children !== undefined) args.push(children);
    return call(tree.component, [[null, call(c.name, args)]]);
  }

  /** The statements drawing `tree`. */
  render(tree: PageTree, scope: Scope): Expr[] {
    switch (tree.kind) {
      case 'text':
        this.text = true;
        return [call('BasicText', [[null, raw(kotlinString(tree.value))]])];
      case 'binding': {
        const value = this.resolve(tree.path, scope);
        if (value === null) return [];
        if (typeof value !== 'string' && typeof value !== 'number') {
          return this.fail(`${tree.path.join('.')} is shown as text, not ${described(value)}`);
        }
        this.text = true;
        return [call('BasicText', [[null, raw(kotlinString(String(value)))]])];
      }
      case 'fragment':
        return tree.children.flatMap((child) => this.render(child, scope));
      case 'when':
        return tree.state === 'full'
          ? tree.children.flatMap((child) => this.render(child, scope))
          : [];
      case 'each': {
        const items = this.resolve(tree.of, scope);
        if (!Array.isArray(items)) return this.fail(`${tree.of.join('.')} is not a list`);
        return items.flatMap((item) =>
          tree.children.flatMap((child) => this.render(child, new Map(scope).set(tree.as, item))),
        );
      }
      case 'element':
        return [this.element(tree, scope)];
    }
  }
}

const slot = (tree: PageTree | undefined): PropValue | undefined =>
  tree === undefined ? undefined : { kind: 'slot', tree };

export function generateKotlinPage(
  tree: PageTree,
  id: string,
  placeholder: unknown,
  model: PropsModel,
  { nav, shell, page, now = [] }: KotlinShell,
): string {
  const decls = declsOf(model);
  const pages = new Map(
    nav.pages.filter((p) => p.platforms.includes('android')).map((p) => [p.id, p]),
  );
  /** What the page uses from the generated nav graph. */
  const fromNav = new Set(['PageActions']);
  /** Each of the shell's actions, as Kotlin: the lambda its handler prop takes. */
  const spell = (action: ShellAction): Expr => {
    switch (action.kind) {
      case 'close': {
        const to = pages.get(action.home);
        if (to === undefined)
          throw new Error(`${id}: closes to ${action.home}, not an Android page`);
        fromNav.add('Route').add('closePage');
        return lambda([raw(`closePage(navController, ${routeCall(to)})`)]);
      }
      case 'destination':
        fromNav.add('openDestination');
        return lambda([raw('openDestination(navController, key)')], 'key');
      case 'open':
        fromNav.add('Route');
        return lambda([raw(`navController.navigate(${routeCall(pages.get(action.page)!)})`)]);
      case 'tab':
        fromNav.add('openTab');
        return lambda([raw('openTab(navController, tab)')], 'tab');
      case 'rail':
        throw new Error(`${id}: Android's phone has no rail to collapse`);
      case 'panel':
        throw new Error(`${id}: Android's phone has no player panel to show`);
      case 'lit':
        fromNav.add('litDestination');
        return raw(`litDestination(navController, ${kotlinString(action.fallback)})`);
    }
  };
  /** Android's back does what the page's close control does, on a page that closes. */
  const closing = closeAction(nav, page);
  const back = closing === undefined ? undefined : spell(closing);
  let root: PageTree;
  let wired: ShellHandlers;
  if (page.presentation === 'sheet') {
    root = playerTree(playerTab(page), framePage(tree).content);
    wired = shellHandlers(nav, page, { player: root }, 'android');
  } else {
    const layout = nav.layouts[0];
    if (layout === undefined) throw new Error('nav.json has no layouts');
    const platformed = new Set(
      [...decls.classes.values()]
        .filter((c) => c.props.some((p) => p.name === 'platform'))
        .map((c) => c.name.replace(/Props$/, '')),
    );
    const parts = chrome(nav, shell, page, layout, platformed, now);
    const given = <K extends string>(name: K, value: PropValue | undefined) =>
      (value === undefined ? {} : { [name]: value }) as Partial<Record<K, PropValue>>;
    root = framed(framePage(tree), page.title, {
      ...given('rail', slot(parts.rail)),
      ...given('leading', slot(parts.leading)),
      ...given('player', slot(parts.player)),
      ...given('sheet', slot(parts.sheet)),
      sheetOpen: { kind: 'literal', value: parts.sheetOpen },
      appBar: { kind: 'literal', value: parts.appBar },
      ...given(
        'column',
        parts.column === undefined ? undefined : { kind: 'literal', value: parts.column },
      ),
    });
    wired = shellHandlers(nav, page, { chrome: parts }, 'android');
  }
  const handlers = new Map(
    [...wired].map(([element, props]) => [
      element,
      Object.fromEntries(Object.entries(props).map(([prop, action]) => [prop, spell(action)])),
    ]),
  );
  const writer = new PageWriter(id, decls, pages, handlers);
  const scope: Scope = new Map<string, unknown>([
    ['data', placeholder],
    ['shell', shellData(nav, shell)],
  ]);
  const body = writer.render(root, scope);
  const name = `${componentName(id)}Page`;
  for (const n of writer.nav) fromNav.add(n);
  const imports = [
    ...(back !== undefined ? ['androidx.activity.compose.BackHandler'] : []),
    ...(writer.text ? ['androidx.compose.foundation.text.BasicText'] : []),
    'androidx.compose.runtime.Composable',
    'androidx.navigation.NavController',
    ...[...fromNav].map((n) => `${KOTLIN_NAV_PACKAGE}.${n}`),
    ...[...writer.types].map((t) => `${KOTLIN_PACKAGE}.${t}`),
    ...[...writer.composables].map((c) =>
      c === name ? `${KOTLIN_SONORA_PACKAGE}.${c} as Sonora${c}` : `${KOTLIN_SONORA_PACKAGE}.${c}`,
    ),
  ]
    .sort()
    .map((i) => `import ${i}`);
  const rename = (e: Expr): Expr =>
    e.t === 'call'
      ? {
          ...e,
          fn: e.fn === name ? `Sonora${name}` : e.fn,
          args: e.args.map(([n, v]) => [n, rename(v)]),
        }
      : e.t === 'lambda'
        ? { ...e, body: e.body.map(rename) }
        : e;
  const statements = [
    ...(back !== undefined ? [`BackHandler ${print(back, STEP, 16)}`] : []),
    ...body.map((s) => print(rename(s), STEP, STEP.length)),
  ];
  return [
    `// ${APP_NOTE}`,
    `package ${KOTLIN_PAGES_PACKAGE}`,
    '',
    ...imports,
    '',
    `/** ${page.title}, as design/app/pages/${id}.page.jsx draws it on the phone, with its placeholder data. */`,
    '@Composable',
    `fun ${name}(navController: NavController, actions: PageActions) {`,
    ...statements.map((s) => `${STEP}${s}`),
    '}',
    '',
  ].join('\n');
}
