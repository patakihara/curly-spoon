import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KOTLIN_SONORA_PACKAGE, OUTPUTS, REPO_ROOT } from './outputs.js';

/**
 * Android's Sonora composables are hand-written, one per component a generated page calls. A
 * component that joins a page on the canvas has no composable until someone writes one; these
 * tests name it, rather than leaving the Android build to fail on an unresolved import.
 */
const SONORA_DIR = join(
  REPO_ROOT,
  'android/app/src/main/java',
  ...KOTLIN_SONORA_PACKAGE.split('.'),
);
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

/** Every public composable in the app's Sonora package, with the props type it takes. */
function composables(): Map<string, string> {
  const found = new Map<string, string>();
  for (const source of kotlinFiles(SONORA_DIR))
    for (const m of source.matchAll(/^@Composable\s+fun (\w+)\(([^)]*)\)/gm))
      found.set(m[1]!, m[2]!.trim());
  return found;
}

const sorted = (s: Iterable<string>) => [...s].sort();

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
});
