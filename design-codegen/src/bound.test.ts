import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const webPages = join(repoRoot, 'web/src/generated/pages');
const androidGenerated = join(
  repoRoot,
  'android/app/src/main/java/net/develivarr/auralis/generated',
);
const androidPages = join(androidGenerated, 'pages');

const files = (dir: string, ext: string) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => ({ name: f, text: readFileSync(join(dir, f), 'utf8') }));

/** Each line of `text` matching `pattern`, as `name:line: text`. */
const hits = (name: string, text: string, pattern: RegExp) =>
  text
    .split('\n')
    .map((line, i) => [line, i + 1] as const)
    .filter(([line]) => pattern.test(line))
    .map(([line, n]) => `${name}:${n}: ${line.trim()}`);

describe('the generated pages', () => {
  // A control given a handler that does nothing looks enabled and is dead: Sofia should not have to
  // guess which buttons work. Unbound, a Sonora control draws disabled instead.
  it('[M0.states/c] bind no handler that does nothing, on the web', () => {
    const found = files(webPages, '.tsx').flatMap(({ name, text }) =>
      hits(
        name,
        text,
        /=\{ignore\}|\bconst ignore\b|\(\w*\) => \{\s*\}|\(\w*\) => (undefined|null)\b/,
      ),
    );
    expect(found).toEqual([]);
  });

  it('[M0.states/c] bind no handler that does nothing, on Android', () => {
    const found = files(androidPages, '.kt').flatMap(({ name, text }) =>
      hits(name, text, /=\s*\{\s*(\w+(,\s*\w+)*\s*->\s*)?\}|actions\.onRequest/),
    );
    expect(found).toEqual([]);
  });

  it('[M0.states/c] ask the app for no request, which it has no way to make yet', () => {
    const graph = readFileSync(join(androidGenerated, 'nav/AuralisNavGraph.kt'), 'utf8');
    expect(graph).not.toContain('onRequest');
  });
});
