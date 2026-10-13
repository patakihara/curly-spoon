/**
 * Which release the staging container must have caught up with, read from GitHub's latest
 * release. The live checks in live.test.mjs apply it to the real answer.
 * Run: node --test scripts/repo/staging.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDue, newestRelease, STAGING_GRACE_MS } from './staging.mjs';

const NOW = Date.parse('2026-09-29T12:00:00Z');
const latest = (fields = {}) => ({
  tag_name: 'v0.4.0',
  draft: false,
  prerelease: false,
  published_at: '2026-09-29T11:20:00Z',
  ...fields,
});

test('staging is given 30 minutes to follow a release', () => {
  assert.equal(STAGING_GRACE_MS, 30 * 60 * 1000);
});

test('the newest release is read as its tag and the time it was published', () => {
  assert.deepEqual(newestRelease(latest()), {
    tag: 'v0.4.0',
    at: Date.parse('2026-09-29T11:20:00Z'),
  });
});

test('a draft or a prerelease is never the newest release', () => {
  assert.throws(() => newestRelease(latest({ draft: true })), /draft/);
  assert.throws(() => newestRelease(latest({ prerelease: true })), /prerelease/);
});

test('an answer without a tag or a publish time is refused', () => {
  assert.throws(() => newestRelease(latest({ tag_name: undefined })), /tag_name/);
  assert.throws(() => newestRelease(latest({ published_at: null })), /published_at/);
  assert.throws(() => newestRelease(latest({ published_at: 'soon' })), /published_at/);
});

test('a release is due once 30 minutes have passed since it was published', () => {
  const release = newestRelease(latest());
  assert.equal(isDue(release, NOW), true);
  assert.equal(isDue(release, release.at + STAGING_GRACE_MS), true);
  assert.equal(isDue(release, release.at + STAGING_GRACE_MS - 1), false);
});
