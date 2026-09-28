import { describe, expect, it } from 'vitest';
import type { ClassDecl, Decl, KType } from './props.js';
import { modelOf, oneComponent } from './test-sonora.js';

const S: KType = { kind: 'string' };
const F: KType = { kind: 'float' };
const B: KType = { kind: 'boolean' };
const opt = (type: KType): KType => ({ kind: 'nullable', type });
const named = (name: string, args: KType[] = []): KType => ({ kind: 'named', name, args });
const slot: KType = opt({ kind: 'slot' });
const unit = 'unit' as const;
const fn = (params: KType[], returns: KType | 'unit' = unit, composable = false): KType => ({
  kind: 'fn',
  params,
  returns,
  composable,
});

function declsOf(members: string, preamble?: string): Decl[] {
  return modelOf(oneComponent(members, preamble)).files.get('X')!;
}
function classOf(members: string, preamble?: string): ClassDecl {
  return declsOf(members, preamble)[0] as ClassDecl;
}
const typeOf = (member: string) => classOf(member).props[0]!.type;

describe('the props model read from Sonora .d.ts files', () => {
  it.each<[string, string, KType]>([
    ['x?: T is an optional T', 'a?: string;', S],
    ['boolean', 'a: boolean;', B],
    ['number is Float', 'a: number;', F],
    ['T | null is a nullable T', 'a: number | null;', opt(F)],
    ["'x' | string widens to string", "a: 'now' | 'queue' | string;", S],
    ['string | number is Any, for keys and ids', 'a: string | number;', { kind: 'any' }],
    ['T[] is a List', 'a: string[];', { kind: 'list', item: S }],
    ['Array<T> is a List', 'a: Array<boolean>;', { kind: 'list', item: B }],
    ['Record<string, V> is a Map', 'a: Record<string, string>;', { kind: 'map', value: S }],
    ['ReactNode is a nullable slot', 'a: ReactNode;', slot],
    ['React.ReactNode is a nullable slot', 'a: React.ReactNode;', slot],
    ['() => void is a function to Unit', 'a: () => void;', fn([])],
    ['a callback maps its parameters', 'a: (from: number, to: number) => void;', fn([F, F])],
    ['DOMRect is a Rect', 'a: (origin: DOMRect | null) => void;', fn([opt({ kind: 'rect' })])],
    [
      "a handler's optional any parameter is its web event, dropped",
      'onA?: (e?: any) => void;',
      fn([]),
    ],
    ["a handler's any parameter is its web event, dropped", 'onA: (e: any) => void;', fn([])],
    ['a web event parameter is dropped', 'onA?: (e: MouseEvent) => void;', fn([])],
    [
      'a web event parameter is dropped, whatever else the callback takes',
      'onA?: (id: string, e?: React.MouseEvent<HTMLDivElement>) => void;',
      fn([S]),
    ],
    ['JSX.Element is a slot', 'a: JSX.Element;', { kind: 'slot' }],
    ['React.JSX.Element is a slot', 'a?: React.JSX.Element;', { kind: 'slot' }],
    [
      'a render prop is a composable function',
      'a: ((n: number) => ReactNode) | ReactNode;',
      fn([F], unit, true),
    ],
  ])('[M0.uikit/a] %s', (_title, member, expected) => {
    expect(typeOf(member)).toEqual(expected);
  });

  it('[M0.uikit/a] keeps the .d.ts order, names, optionality and JSDoc', () => {
    const cls = classOf('  /** The label. */\n  zeta: string;\n  alpha?: boolean;');
    expect(cls).toMatchObject({ kind: 'class', name: 'XProps', webOnly: [] });
    expect(cls.props).toEqual([
      { name: 'zeta', doc: 'The label.', type: S, optional: false },
      { name: 'alpha', doc: undefined, type: B, optional: true },
    ]);
  });

  it('[M0.uikit/a] a string literal union is a component enum keeping each value', () => {
    const decls = declsOf("  variant?: 'primary' | 'ghost-ish';");
    expect((decls[0] as ClassDecl).props[0]!.type).toEqual(named('XVariant'));
    expect(decls[1]).toEqual({ kind: 'enum', name: 'XVariant', values: ['primary', 'ghost-ish'] });
  });

  it('[M0.uikit/a] a prop with one value set in two components shares one enum, Platform', () => {
    const model = modelOf({
      'core/A.d.ts': "export interface AProps { platform?: 'desktop' | 'mobile'; }\n",
      'core/B.d.ts': "export interface BProps { platform?: 'mobile' | 'desktop'; }\n",
    });
    expect((model.files.get('A')![0] as ClassDecl).props[0]!.type).toEqual(named('Platform'));
    expect((model.files.get('B')![0] as ClassDecl).props[0]!.type).toEqual(named('Platform'));
    expect(model.files.get('A')).toHaveLength(1);
    expect(model.shared).toEqual([
      { kind: 'enum', name: 'Platform', values: ['desktop', 'mobile'] },
    ]);
  });

  it('[M0.uikit/a] one value set is one enum, whatever the props are called', () => {
    const model = modelOf({
      'core/A.d.ts':
        "export interface AView { defaultMode?: 'list' | 'grid'; }\nexport interface AProps { mode: 'list' | 'grid'; onMode?: (m: 'grid' | 'list') => void; }\n",
      'core/B.d.ts':
        "export interface BProps { value?: 'grid' | 'list'; mode?: 'list' | 'grid'; }\n",
      'core/C.d.ts': "export interface CProps { download?: 'idle' | 'done'; }\n",
      'core/D.d.ts': "export interface DProps { state: 'done' | 'idle'; }\n",
    });
    const types = (file: string) =>
      model.files
        .get(file)!
        .filter((d): d is ClassDecl => d.kind === 'class')
        .flatMap((d) => d.props.map((p) => p.type));
    // The most used name wins; a tie goes to the longer, more specific name.
    expect(types('A')).toEqual([named('Mode'), named('Mode'), fn([named('Mode')])]);
    expect(types('B')).toEqual([named('Mode'), named('Mode')]);
    expect(types('C')).toEqual([named('Download')]);
    expect(types('D')).toEqual([named('Download')]);
    expect(model.shared.map((e) => [e.name, e.values])).toEqual([
      ['Download', ['idle', 'done']],
      ['Mode', ['list', 'grid']],
    ]);
    expect(model.files.get('A')!.some((d) => d.kind === 'enum')).toBe(false);
  });

  it('[M0.uikit/a] one value set used twice in one component is one enum of that component', () => {
    const decls = declsOf("  size?: 'sm' | 'md';\n  iconSize?: 'md' | 'sm';");
    expect((decls[0] as ClassDecl).props.map((p) => p.type)).toEqual([
      named('XSize'),
      named('XSize'),
    ]);
    expect(decls.filter((d) => d.kind === 'enum')).toEqual([
      { kind: 'enum', name: 'XSize', values: ['sm', 'md'] },
    ]);
  });

  it('[M0.uikit/a] two value sets claiming one shared name each take their values as a suffix', () => {
    const model = modelOf({
      'core/A.d.ts': "export interface AProps { size?: 'sm' | 'md'; }\n",
      'core/B.d.ts': "export interface BProps { size?: 'sm' | 'md'; }\n",
      'core/C.d.ts': "export interface CProps { size?: 'sm' | 'md' | 'lg'; }\n",
      'core/D.d.ts': "export interface DProps { size?: 'sm' | 'md' | 'lg'; }\n",
    });
    expect(model.shared.map((e) => e.name)).toEqual(['SizeSmMd', 'SizeSmMdLg']);
  });

  it('[M0.uikit/a] an enum named like a Kotlin or Compose type takes the Sonora prefix', () => {
    const model = modelOf({
      'core/A.d.ts': "export interface AProps { color?: 'red' | 'blue'; }\n",
      'core/B.d.ts': "export interface BProps { color?: 'red' | 'blue'; }\n",
    });
    expect((model.files.get('A')![0] as ClassDecl).props[0]!.type).toEqual(named('SonoraColor'));
    expect(model.shared.map((e) => e.name)).toEqual(['SonoraColor']);
  });

  it('[M0.uikit/a] refuses a class named like a Kotlin or Compose type', () => {
    expect(() =>
      modelOf({
        'core/X.d.ts':
          'export interface Text { a: string; }\nexport interface XProps { t: Text; }\n',
      }),
    ).toThrow('Text is a Kotlin or Compose type name');
  });

  it('[M0.uikit/a] a literal union in a callback parameter reuses the component enum with that value set', () => {
    const cls = classOf(
      "  onModeChange?: (mode: 'b' | 'a') => void;\n  mode?: 'a' | 'b';\n  onOther?: (v: 'c' | 'd') => void;",
    );
    expect(cls.props.map((p) => p.type)).toEqual([
      fn([named('XMode')]),
      named('XMode'),
      fn([named('XOnOtherArg')]),
    ]);
  });

  it('[M0.uikit/a] a mixed primitive union is a sealed interface of one value class per member', () => {
    const decls = declsOf('  edgeFade?: boolean | number;');
    expect((decls[0] as ClassDecl).props[0]!.type).toEqual(named('XEdgeFade'));
    expect(decls[1]).toEqual({ kind: 'sealed', name: 'XEdgeFade', members: [B, F] });
  });

  it('[M0.uikit/a] string | Obj array items keep only the object', () => {
    const decls = declsOf('  items: (string | { key: string })[];', '');
    expect((decls[0] as ClassDecl).props[0]!.type).toEqual({
      kind: 'list',
      item: named('XItem'),
    });
    expect(decls[1]).toMatchObject({ kind: 'class', name: 'XItem', props: [{ name: 'key' }] });
  });

  it('[M0.uikit/a] an inline object is a data class named for its owner and prop', () => {
    const decls = declsOf('  origin?: { x: number; y: number } | null;');
    expect((decls[0] as ClassDecl).props[0]!.type).toEqual(opt(named('XOrigin')));
    expect(decls[1]).toEqual({
      kind: 'class',
      name: 'XOrigin',
      typeParams: [],
      doc: undefined,
      webOnly: [],
      props: [
        { name: 'x', doc: undefined, type: F, optional: false },
        { name: 'y', doc: undefined, type: F, optional: false },
      ],
    });
  });

  it('[M0.uikit/a] a named interface, imported from a sibling, is its own data class', () => {
    const model = modelOf({
      'media/Queue.d.ts':
        'export interface QueueItem { title: string; }\nexport interface QueueProps { items?: QueueItem[]; }\n',
      'media/Player.d.ts':
        "import { QueueItem } from './Queue';\nexport interface PlayerProps { current?: QueueItem; }\n",
    });
    expect(model.files.get('Queue')!.map((d) => d.name)).toEqual(['QueueItem', 'QueueProps']);
    expect((model.files.get('Player')![0] as ClassDecl).props[0]!.type).toEqual(named('QueueItem'));
  });

  it('[M0.uikit/a] Pick and Omit are data classes of the resolved properties, in source order', () => {
    const model = modelOf({
      'media/Page.d.ts':
        "export interface PageProps { platform?: 'desktop' | 'mobile'; title?: string; mode?: 'a' | 'b'; count: number; }\n",
      'media/Panel.d.ts':
        "import { PageProps } from './Page';\nexport interface PanelProps { page?: Omit<PageProps, 'platform'>; picked: Pick<PageProps, 'count' | 'title'>; }\n",
    });
    const panel = model.files.get('Panel')!;
    expect((panel[0] as ClassDecl).props.map((p) => p.type)).toEqual([
      named('PanelPage'),
      named('PanelPicked'),
    ]);
    const page = panel.find((d) => d.name === 'PanelPage') as ClassDecl;
    expect(page.props.map((p) => [p.name, p.type, p.optional])).toEqual([
      ['title', S, true],
      ['mode', named('PageMode'), true],
      ['count', F, false],
    ]);
    const picked = panel.find((d) => d.name === 'PanelPicked') as ClassDecl;
    expect(picked.props.map((p) => p.name)).toEqual(['title', 'count']);
    // PageMode is declared once, beside the interface that owns the prop.
    expect(model.files.get('Page')!.filter((d) => d.name === 'PageMode')).toHaveLength(1);
    expect(panel.some((d) => d.name === 'PageMode')).toBe(false);
  });

  it('[M0.uikit/a] a generic interface is a generic class, its default dropped', () => {
    const model = modelOf({
      'layout/X.d.ts':
        "import { ReactNode } from 'react';\nexport interface XRow<T> { item: T; }\nexport interface XProps<T = any> { items?: T[]; renderRow: (row: XRow<T>) => ReactNode; }\n",
    });
    const [row, props] = model.files.get('X') as ClassDecl[];
    expect(row!.typeParams).toEqual(['T']);
    expect(props!.typeParams).toEqual(['T']);
    expect(props!.props.map((p) => p.type)).toEqual([
      { kind: 'list', item: { kind: 'typeParam', name: 'T' } },
      fn([named('XRow', [{ kind: 'typeParam', name: 'T' }])], unit, true),
    ]);
  });

  it('[M0.uikit/a] only the web-only allowlist is omitted, and named as web only', () => {
    const cls = classOf(
      '  children?: ReactNode;\n  style?: CSSProperties;\n  className?: string;\n  onScroll?: (event: UIEvent<HTMLDivElement>) => void;\n  scrollRef?: { current: HTMLDivElement | null } | ((el: HTMLDivElement | null) => void);',
      "import { ReactNode, CSSProperties, UIEvent } from 'react';\n",
    );
    expect(cls.props.map((p) => [p.name, p.type])).toEqual([
      ['children', slot],
      ['onScroll', fn([])],
    ]);
    expect(cls.webOnly).toEqual(['style', 'className', 'scrollRef']);
  });

  it.each<[string, string, string]>([
    ['an element', 'el?: HTMLDivElement;', 'X.el: unsupported type HTMLDivElement'],
    ['a DOM Element', 'el?: Element;', 'X.el: unsupported type Element'],
    ['a ref', 'r?: RefObject<HTMLElement>;', 'X.r: unsupported type RefObject<HTMLElement>'],
    [
      'an element parameter',
      'onEl?: (el: HTMLElement) => void;',
      'X.onEl: unsupported type HTMLElement',
    ],
    ['an element result', 'at?: () => HTMLElement;', 'X.at: unsupported type HTMLElement'],
    ['any', 'a: any;', 'X.a: unsupported type any'],
    ['unknown', 'a?: unknown;', 'X.a: unsupported type unknown'],
    ['any in a list', 'a?: any[];', 'X.a: unsupported type any'],
    [
      'an any parameter outside a handler',
      'pick: (item: any) => void;',
      'X.pick: unsupported type any',
    ],
    ['a web event outside a callback', 'e?: MouseEvent;', 'X.e: unsupported type MouseEvent'],
    [
      'a rest parameter',
      'onMany?: (...ids: string[]) => void;',
      'X.onMany: unsupported rest parameter ...ids: string[]',
    ],
  ])('[M0.uikit/a] refuses %s, naming the component and prop', (_title, member, message) => {
    expect(() => classOf(`  ${member}`, "import { RefObject } from 'react';\n")).toThrow(message);
  });

  it("[M0.uikit/a] an input-like component's onChange carries the string value", () => {
    const cls = classOf('  value?: string;\n  onChange?: (e: any) => void;');
    expect(cls.props[1]!.type).toEqual(fn([S]));
    // Without a string value, the any is just the web event.
    expect(classOf('  checked?: boolean;\n  onChange?: (e: any) => void;').props[1]!.type).toEqual(
      fn([]),
    );
  });

  it("[M0.uikit/a] LibraryShell's opaque detail item is Any?, the one known any", () => {
    const model = modelOf({
      'layout/LibraryShell.d.ts':
        'export interface LibraryShellContext { detail: any; openDetail: (item: any, event?: React.MouseEvent) => void; }\nexport interface LibraryShellProps { view: string; }\n',
    });
    const ctx = model.files.get('LibraryShell')![0] as ClassDecl;
    expect(ctx.props.map((p) => p.type)).toEqual([{ kind: 'unknown' }, fn([{ kind: 'unknown' }])]);
  });

  it('[M0.uikit/a] refuses a type it cannot map, naming the component and prop', () => {
    expect(() => classOf('  weird?: symbol;')).toThrow('X.weird: unsupported type symbol');
    expect(() => classOf("  mixed?: 'a' | 1;")).toThrow("X.mixed: unsupported type 'a' | 1");
  });

  it('[M0.uikit/a] refuses two classes that would share a name', () => {
    expect(() =>
      modelOf({
        'core/X.d.ts':
          'export interface XOrigin { a: string; }\nexport interface XProps { origin?: { x: number }; }\n',
      }),
    ).toThrow(/XOrigin is declared twice/);
  });
});
