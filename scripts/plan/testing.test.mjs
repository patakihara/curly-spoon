/**
 * The shared test helpers: fixture repos that clean up without racing git.
 * Run: node --test scripts/plan/testing.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fixtureRepo, GIT_ENV, removeTree } from './testing.mjs';

test('a fixture repo commit forks no background git maintenance that could outlive removeTree', () => {
  const { root } = fixtureRepo();
  try {
    const trace = execFileSync('sh', ['-c', 'git commit -q --allow-empty -m Empty 2>&1'], {
      cwd: root,
      env: { ...GIT_ENV, GIT_TRACE: '1' },
      encoding: 'utf8',
    });
    assert.doesNotMatch(trace, /maintenance|\bgc\b/);
  } finally {
    removeTree(root);
  }
  assert.equal(existsSync(root), false);
});
