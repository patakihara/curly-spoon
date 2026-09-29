/**
 * Nothing removed lingers: a Sonora component deleted from design/sonora is named nowhere in the
 * apps or the canvas, and every exception an ignore file carves out names a file that exists.
 * Reads Sonora's history, so CI's checkout needs full history (fetch-depth: 0).
 * Run: node --test scripts/repo/leftovers.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const lines = (s) => s.split('\n').filter(Boolean);

/** Where the apps and the canvas use Sonora's components by name. */
const USERS = ['web/src', 'android', 'design/app', 'server/src', 'schema'];
const COMPONENT = /^design\/sonora\/components\/.*\/([A-Z][A-Za-z0-9]*)\.(?:d\.ts|jsx)$/;

/** Component names Sonora's history has deleted, with no component of that name left today. */
function deletedComponents() {
  const named = (paths) =>
    new Set(paths.map((p) => COMPONENT.exec(p)?.[1]).filter((n) => n !== undefined));
  const deleted = named(
    lines(git('log', '--diff-filter=D', '--name-only', '--format=', '--', 'design/sonora')),
  );
  const live = named(lines(git('ls-files', 'design/sonora/components')));
  return [...deleted].filter((n) => !live.has(n)).sort();
}

test('Sonora has deleted components to check for', () => {
  assert.ok(deletedComponents().length > 0);
});

test('no deleted Sonora component is named in the apps or the canvas', () => {
  const found = deletedComponents().flatMap((name) => {
    let hits = '';
    try {
      hits = git('grep', '-l', '-w', '-I', name, '--', ...USERS);
    } catch {
      // git grep exits 1 when nothing matches.
    }
    return lines(hits).map((file) => `${name} in ${file}`);
  });
  assert.deepEqual(found, []);
});

test('every exception in .gitignore and .dockerignore names a file that exists', () => {
  const missing = ['.gitignore', '.dockerignore'].flatMap((file) =>
    readFileSync(join(root, file), 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('!'))
      .map((line) => line.slice(1))
      .filter((path) => !existsSync(join(root, path)))
      .map((path) => `${basename(file)}: !${path}`),
  );
  assert.deepEqual(missing, []);
});
