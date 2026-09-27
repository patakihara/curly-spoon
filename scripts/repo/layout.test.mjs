/**
 * The repository's own shape, read from git: the legacy tag, the rebuild's top-level folders,
 * and Sonora's history kept free of the Spotify screenshots and outside author identities.
 * CI's checkout needs full history and tags (fetch-depth: 0) for these to see anything.
 * Run: node --test scripts/repo/layout.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const lines = (s) => s.split('\n').filter(Boolean);
const { sonoraAuthors } = JSON.parse(
  readFileSync(join(root, 'scripts/repo/identities.json'), 'utf8'),
);

const SPOTIFY = 'design/sonora/assets/reference/spotify/';
const LAYOUT = ['server', 'web', 'android', 'schema', 'design/sonora', 'design/app', 'docs/plan'];

/** Whether `path` is a folder in HEAD. */
const isTree = (path) => {
  try {
    return git('cat-file', '-t', `HEAD:${path}`) === 'tree';
  } catch {
    return false;
  }
};

test('[M0.repo/a] the old code stays at the tag legacy', () => {
  assert.match(git('rev-parse', '-q', '--verify', 'refs/tags/legacy^{commit}'), /^[0-9a-f]{40}$/);
});

test('[M0.repo/a] main has the rebuild layout and none of the legacy apps/ or packages/', () => {
  for (const path of LAYOUT) assert.ok(isTree(path), `${path} is a folder in HEAD`);
  const top = lines(git('ls-tree', '--name-only', 'HEAD'));
  assert.ok(!top.includes('apps'), 'no apps/');
  assert.ok(!top.includes('packages'), 'no packages/');
});

test('[M0.repo/b] no Spotify reference screenshot is tracked, and that folder is gitignored', () => {
  assert.deepEqual(lines(git('ls-tree', '-r', '--name-only', 'HEAD', '--', SPOTIFY)), []);
  assert.match(git('check-ignore', '-v', `${SPOTIFY}screenshot.png`), /^\.gitignore:/);
});

/**
 * Authors of every commit that brought Sonora in or changed it. `git log -- design/sonora` alone
 * sees only the subtree merge and later commits, because Sonora's imported commits have
 * root-level paths. So this also walks the merge's second parent (the imported history, found by
 * its "Move Sonora in" subject) and takes every author there, whatever paths they touched.
 */
function sonoraAuthorEmails() {
  const merges = lines(git('log', '--format=%H', '--grep', '^Move Sonora in'));
  assert.ok(merges.length > 0, 'the Sonora subtree merge is in the history');
  const emails = new Set(lines(git('log', '--format=%ae', 'HEAD', '--', 'design/sonora')));
  for (const merge of merges) {
    for (const e of lines(git('log', '--format=%ae', `${merge}^1..${merge}^2`))) emails.add(e);
  }
  return [...emails].sort();
}

test('[M0.repo/b] every commit touching design/sonora has an author in the allowed list', () => {
  const outside = sonoraAuthorEmails().filter((e) => !sonoraAuthors.includes(e));
  assert.deepEqual(outside, [], 'authors outside scripts/repo/identities.json');
});
