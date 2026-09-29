/**
 * The repo files the container image holds, worked out without Docker: every file the
 * Dockerfile's final stage copies from the build context, less what `.dockerignore` keeps out
 * (Docker's rules: patterns anchored at the root, `**` across folders, `!` letting a path back
 * in, the last match winning, a match on a folder covering all of it). `runtimeFiles` is what
 * the server runs: `server/src/main.ts` and everything it imports, with the package manifests.
 *
 * `node scripts/guards/image.mjs` prints what the image must hold, `runtimeFiles`, one per line.
 * CI's container job compares that with the files in the built image, so a test or recording let
 * into the image fails there on its own, as well as in this guard's tests.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const escape = (s) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');

function patternRegex(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      const slash = pattern[i + 2] === '/';
      out += slash ? '(?:.*/)?' : '.*';
      i += slash ? 2 : 1;
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else out += escape(c);
  }
  return new RegExp(`^${out}$`);
}

/** A matcher for a `.dockerignore` text: true when the path is kept out of the build context. */
export function dockerignore(text) {
  const rules = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => {
      const exclude = line.startsWith('!');
      const pattern = posix.normalize((exclude ? line.slice(1) : line).replace(/^\/+/, ''));
      return { exclude, regex: patternRegex(pattern.replace(/\/+$/, '')) };
    });
  return (path) => {
    const parts = path.split('/');
    const prefixes = parts.map((_, i) => parts.slice(0, i + 1).join('/'));
    let ignored = false;
    for (const rule of rules) {
      if (prefixes.some((p) => rule.regex.test(p))) ignored = !rule.exclude;
    }
    return ignored;
  };
}

/** The context paths the Dockerfile's final stage copies (not those copied from other stages). */
function finalStageSources(dockerfile) {
  const lines = dockerfile.split(/\r?\n/);
  const from = lines.findLastIndex((line) => /^FROM\s/i.test(line));
  return lines
    .slice(from + 1)
    .filter((line) => /^COPY\s/i.test(line) && !/--from=/.test(line))
    .flatMap((line) => {
      const args = line
        .trim()
        .split(/\s+/)
        .slice(1)
        .filter((a) => !a.startsWith('--'));
      return args.slice(0, -1);
    });
}

function listFiles(root, paths) {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard', '--', ...paths], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => f !== '' && existsSync(join(root, f)));
}

/** Every repo file the built image holds, sorted. */
export function imageFiles(root) {
  const ignored = dockerignore(readFileSync(join(root, '.dockerignore'), 'utf8'));
  const sources = finalStageSources(readFileSync(join(root, 'Dockerfile'), 'utf8'));
  return [...new Set(listFiles(root, sources))].filter((f) => !ignored(f)).sort();
}

/** True for a file only tests use: a test, a recording, the test key, the recorder or the harness. */
export function testOnly(file) {
  return (
    /\.test\.[cm]?[jt]sx?$/.test(file) ||
    file.includes('/recordings/') ||
    file.startsWith('server/e2e/') ||
    /^server\/src\/adapters\/record-[^/]+$/.test(file) ||
    (file.startsWith('server/src/adapters/http/') && file !== 'server/src/adapters/http/fetch.ts')
  );
}

const WORKSPACE = { '@auralis/schema': 'schema/src/index.ts' };
const IMPORT = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(?\s*['"]([^'"]+)['"]/g;

/** `server/src/main.ts`, every repo file it imports, transitively, and both package manifests. */
export function runtimeFiles(root) {
  const seen = new Set();
  const queue = ['server/src/main.ts'];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    if (!existsSync(join(root, file))) throw new Error(`${file} is imported but does not exist`);
    seen.add(file);
    if (!/\.[cm]?[jt]s$/.test(file)) continue;
    for (const m of readFileSync(join(root, file), 'utf8').matchAll(IMPORT)) {
      const spec = m[1] ?? m[2];
      if (spec in WORKSPACE) queue.push(WORKSPACE[spec]);
      else if (spec.startsWith('.')) {
        queue.push(posix.join(posix.dirname(file), spec).replace(/\.js$/, '.ts'));
      }
    }
  }
  return [...seen, 'schema/package.json', 'server/package.json'].sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  process.stdout.write(`${runtimeFiles(root).join('\n')}\n`);
}
