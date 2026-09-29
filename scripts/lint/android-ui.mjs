/**
 * The Android app draws no UI by hand. Every `.kt` file under android/ (all modules, all source
 * sets) is read for @Composable function declarations: `@Composable` or
 * `@androidx.compose.runtime.Composable`, possibly among other annotations and modifiers, directly
 * before `fun`. A composable type such as `(@Composable () -> Unit)` is not a declaration. Such a
 * function may live only in a package folder named `generated` (pages and nav, from design/app)
 * or in `ui/sonora` (one composable per Sonora component), or in a file of ANDROID_UI_ALLOWED.
 * scripts/lint/android-ui.test.mjs runs it over the repo in `pnpm test` and CI.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * The whole allowlist: repo-relative files, each with the reason it may declare a composable.
 * Empty: MainActivity's setContent mounts the generated nav graph without a composable of its own.
 */
export const ANDROID_UI_ALLOWED = {};

const ANNOTATION = String.raw`@[\w.]+(?:\([^)]*\))?`;
const DECLARATION = new RegExp(
  String.raw`@(?:androidx\.compose\.runtime\.)?Composable\b(?!\s*\()(?:\s+${ANNOTATION})*` +
    String.raw`(?:\s+(?:private|internal|public|protected|inline|override|suspend|actual|expect))*` +
    String.raw`\s+fun\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?(\w+)`,
  'g',
);

/** Comments blanked out, line breaks kept, so line numbers stay true. */
const withoutComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (c) => c.replace(/[^\n]/g, ' '));

/** Each @Composable function declared in a Kotlin source, as `{ line, name }`. */
export function composableFunctions(source) {
  const text = withoutComments(source);
  return [...text.matchAll(DECLARATION)].map((m) => ({
    line: text.slice(0, m.index).split('\n').length,
    name: m[1],
  }));
}

/** Whether a repo-relative Kotlin file may declare composables. */
export function isAllowedPath(rel) {
  const parts = rel.split('/');
  if (parts.includes('generated')) return true;
  if (rel.includes('/ui/sonora/')) return true;
  return rel in ANDROID_UI_ALLOWED;
}

function kotlinFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory())
      return e.name === 'build' || e.name.startsWith('.') ? [] : kotlinFiles(join(dir, e.name));
    return e.name.endsWith('.kt') ? [join(dir, e.name)] : [];
  });
}

/** Every composable declared where it may not be, as `path:line name`. */
export function handDrawnComposables(root) {
  return kotlinFiles(join(root, 'android'))
    .map((file) => relative(root, file))
    .filter((rel) => !isAllowedPath(rel))
    .flatMap((rel) =>
      composableFunctions(readFileSync(join(root, rel), 'utf8')).map(
        (f) => `${rel}:${f.line} ${f.name}`,
      ),
    );
}
