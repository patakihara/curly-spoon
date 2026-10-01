import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { androidComponents, androidSonoraDir } from './android-sonora.js';
import { KOTLIN_SONORA_PACKAGE, OUTPUTS, REPO_ROOT } from './outputs.js';

/**
 * Android's Sonora composables are hand-written, one per component a generated page calls. A
 * component that joins a page on the canvas has no composable until someone writes one; these
 * tests name it, rather than leaving the Android build to fail on an unresolved import.
 */
const SONORA_DIR = androidSonoraDir(REPO_ROOT);
const STUB_TEST = join(
  REPO_ROOT,
  'android/app/src/testDebug/java',
  ...KOTLIN_SONORA_PACKAGE.split('.'),
  'SonoraStubsTest.kt',
);

const kotlinFiles = (dir: string) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.kt'))
    .map((f) => readFileSync(join(dir, f), 'utf8'));

/** The Sonora components the generated pages import, by their own names (`X as SonoraX` too). */
function calledByPages(): Set<string> {
  const called = new Set<string>();
  const imports = new RegExp(
    `^import ${KOTLIN_SONORA_PACKAGE.replaceAll('.', '\\.')}\\.(\\w+)`,
    'gm',
  );
  for (const source of kotlinFiles(join(REPO_ROOT, OUTPUTS.kotlinPages)))
    for (const m of source.matchAll(imports)) called.add(m[1]!);
  return called;
}

/** Every Sonora component composable in the :sonora module, with the props type it takes. */
const composables = () => androidComponents(SONORA_DIR);

const sorted = (s: Iterable<string>) => [...s].sort();

/** The text between `open`, just past an opening bracket, and the bracket that closes it. */
function enclosed(source: string, open: number): string {
  let depth = 1;
  let at = open;
  while (depth > 0 && at < source.length) {
    const c = source[at++]!;
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
  }
  return source.slice(open, at - 1);
}

/** Each component's handler props (`onX = …`) the generated pages pass it, by component. */
function handlersPassed(): Map<string, Set<string>> {
  const passed = new Map<string, Set<string>>();
  for (const source of kotlinFiles(join(REPO_ROOT, OUTPUTS.kotlinPages))) {
    for (const call of source.matchAll(/\b(\w+)Props\(/g)) {
      const args = enclosed(source, call.index + call[0].length);
      let depth = 0;
      for (const token of args.matchAll(/[()[\]{}]|\b(on[A-Z]\w*) =/g)) {
        if ('([{'.includes(token[0])) depth++;
        else if (')]}'.includes(token[0])) depth--;
        else if (depth === 0)
          passed.set(call[1]!, (passed.get(call[1]!) ?? new Set()).add(token[1]!));
      }
    }
  }
  return passed;
}

/**
 * Whether a stub hands `handler` to a tappable element: SonoraStub's `press`, one of its
 * `taps` (`label to props.onX`), or a tap per item for a handler that takes the item's key.
 */
const tappable = (stub: string, handler: string) =>
  new RegExp(
    `Press\\(props\\.${handler}\\b|to props\\.${handler}\\b|props\\.${handler}\\?\\.let`,
  ).test(stub);

describe('the Android Sonora composables', () => {
  it('[M0.canvas] are exactly the components the generated pages call', () => {
    expect(calledByPages().size).toBeGreaterThan(0);
    expect(sorted(composables().keys())).toEqual(sorted(calledByPages()));
  });

  it('[M0.canvas] each take their own generated props, and nothing else', () => {
    for (const [name, params] of composables()) expect(params, name).toBe(`props: ${name}Props`);
  });

  it('[M0.canvas] are each rendered by the stub test', () => {
    const test = readFileSync(STUB_TEST, 'utf8');
    for (const name of composables().keys())
      expect(test, `${name} is not rendered in SonoraStubsTest`).toContain(`${name}(${name}Props(`);
  });

  it('[M0.canvas] let every handler a generated page passes be reached by a tap', () => {
    const passed = handlersPassed();
    expect(passed.get('BottomNav')).toEqual(new Set(['onChange']));
    const unreachable = [...passed].flatMap(([component, handlers]) => {
      const stub = readFileSync(join(SONORA_DIR, `${component}.kt`), 'utf8');
      return [...handlers].filter((h) => !tappable(stub, h)).map((h) => `${component}.${h}`);
    });
    expect(unreachable).toEqual([]);
  });

  it('[M0.canvas] give every tappable element a role, a button or a tab, and a name a screen reader reads', () => {
    // Every control is StateLayer's `control`, whose `clickable` takes the role it is handed.
    const layer = readFileSync(join(SONORA_DIR, 'StateLayer.kt'), 'utf8');
    const clickables = [...layer.matchAll(/\.clickable\(([^)]*)\)/g)].map((m) => m[1]!);
    expect(clickables).toHaveLength(1);
    expect(clickables[0]).toMatch(/\brole = role\b/);
    expect(layer).toMatch(/contentDescription = label/);
    const stub = readFileSync(join(SONORA_DIR, 'SonoraStub.kt'), 'utf8');
    expect(stub).not.toMatch(/\.clickable\(/);
    const controls = [...stub.matchAll(/\.control\(([^)]*)\)/g)].map((m) => m[1]!);
    expect(controls.length).toBeGreaterThan(0);
    for (const c of controls) expect(c).toMatch(/\b(role|press\.role|Role\.(Button|Tab))\b/);
    // A whole box is named by its `label`; Button alone by its children's own text.
    const unnamed = readdirSync(SONORA_DIR)
      .filter((f) => f.endsWith('.kt') && f !== 'SonoraStub.kt')
      .filter((f) => {
        const source = readFileSync(join(SONORA_DIR, f), 'utf8');
        return /Press\(props\.\w+/.test(source) && !/\blabel = props\.\w+/.test(source);
      });
    expect(unnamed).toEqual(['Button.kt']);
  });

  it('finds a handler passed inside another call, and a stub that ignores it', () => {
    expect(tappable('SonoraStub("X", press = Press(props.onClick))', 'onClick')).toBe(true);
    expect(tappable('taps = listOf(props.subtitle to props.onSubtitle)', 'onSubtitle')).toBe(true);
    expect(tappable('SonoraStub("X", texts = listOf(props.title))', 'onClick')).toBe(false);
    expect(tappable('press = Press(props.onClickTwice)', 'onClick')).toBe(false);
  });
});
