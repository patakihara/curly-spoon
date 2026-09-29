/**
 * Which publish the staging container must have caught up with, read from GitHub's list of
 * Publish runs. The live check in live.test.mjs applies it to the real list.
 * Run: node --test scripts/repo/staging.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duePublish, publishes, STAGING_GRACE_MS } from './staging.mjs';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);
const run = (sha, updatedAt, conclusion = 'success') => ({
  display_title: sha === null ? 'Publish' : `Publish ${sha}`,
  conclusion,
  updated_at: updatedAt,
});
const NOW = Date.parse('2026-09-29T12:00:00Z');

test('staging is given 30 minutes to follow a publish', () => {
  assert.equal(STAGING_GRACE_MS, 30 * 60 * 1000);
});

test('a publish is read as the commit its run is named after and the time the run finished', () => {
  assert.deepEqual(publishes([run(A, '2026-09-29T11:00:00Z')]), [
    { commit: A, at: Date.parse('2026-09-29T11:00:00Z') },
  ]);
});

test('a skipped, failed or unnamed run published nothing', () => {
  const runs = [
    run(A, '2026-09-29T11:00:00Z', 'skipped'),
    run(B, '2026-09-29T11:00:00Z', 'failure'),
    run(null, '2026-09-29T11:00:00Z'),
  ];
  assert.deepEqual(publishes(runs), []);
});

test('the due publish is the newest that finished at least 30 minutes ago', () => {
  const list = publishes([
    run(C, '2026-09-29T11:50:00Z'),
    run(B, '2026-09-29T11:20:00Z'),
    run(A, '2026-09-29T10:00:00Z'),
  ]);
  assert.deepEqual(duePublish(list, NOW), { commit: B, at: Date.parse('2026-09-29T11:20:00Z') });
});

test('the order GitHub lists the runs in does not matter', () => {
  const list = publishes([run(A, '2026-09-29T10:00:00Z'), run(B, '2026-09-29T11:20:00Z')]);
  assert.equal(duePublish(list, NOW)?.commit, B);
});

test('nothing is due while every publish is younger than 30 minutes', () => {
  assert.equal(duePublish(publishes([run(C, '2026-09-29T11:45:00Z')]), NOW), null);
  assert.equal(duePublish([], NOW), null);
});
