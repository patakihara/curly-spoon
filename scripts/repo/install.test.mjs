/**
 * A fresh install needs no compiler: no dependency allowed to run its build script compiles
 * native code, and better-sqlite3 loads its prebuilt binary. A worktree on a machine without
 * make or g++ still gets a whole node_modules, and with it the commit hooks.
 * Run: node --test scripts/repo/install.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { pnpm } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const store = join(root, 'node_modules', '.pnpm');

/** Every installed copy of `name` in pnpm's virtual store. */
const installed = (name) =>
  readdirSync(store)
    .filter((d) => d.startsWith(`${name.replace('/', '+')}@`))
    .map((d) => join(store, d, 'node_modules', name));

test('no dependency allowed to build compiles native code', () => {
  for (const name of pnpm.onlyBuiltDependencies ?? []) {
    const copies = installed(name);
    assert.ok(copies.length > 0, `${name} is installed`);
    for (const dir of copies) assert.ok(!existsSync(join(dir, 'binding.gyp')), `${name} compiles`);
  }
});

test('better-sqlite3 opens a database from its prebuilt binary, with nothing compiled', () => {
  const require = createRequire(join(root, 'server', 'package.json'));
  const dir = dirname(require.resolve('better-sqlite3/package.json'));
  assert.ok(!existsSync(join(dir, 'build', 'Release')), 'no compiled binary');
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  assert.equal(db.prepare('select 1 + 1 as two').get().two, 2);
  db.close();
});
