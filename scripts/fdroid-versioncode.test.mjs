/**
 * Tests for the release-tag versionCode scheme in `fdroid-versioncode.mjs`.
 *
 * Uses Node's built-in test runner, not Vitest, for the same reason
 * `scripts/bundle-budget.test.mjs` does: this file lives under `scripts/`, outside
 * `vitest.config.ts`'s `include` globs (each workspace package's own `src/`).
 *
 * Run directly:
 *   node --test scripts/fdroid-versioncode.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTag,
  compareTags,
  computeVersionCode,
  versionNameFromTag,
} from './fdroid-versioncode.mjs';

test('parseTag reads major/minor/patch out of a plain release tag', () => {
  assert.deepEqual(parseTag('v0.2.0'), [0, 2, 0]);
  assert.deepEqual(parseTag('v12.3.45'), [12, 3, 45]);
});

test('parseTag ignores a prerelease suffix when extracting the triple', () => {
  assert.deepEqual(parseTag('v0.4.0-beta.1'), [0, 4, 0]);
});

test('parseTag throws on anything that is not v<major>.<minor>.<patch>', () => {
  assert.throws(() => parseTag('0.2.0'), /Not a valid release tag/);
  assert.throws(() => parseTag('v0.2'), /Not a valid release tag/);
  assert.throws(() => parseTag('release-1'), /Not a valid release tag/);
});

test('compareTags orders by major, then minor, then patch', () => {
  assert.ok(compareTags('v0.1.0', 'v0.2.0') < 0);
  assert.ok(compareTags('v0.2.0', 'v0.1.0') > 0);
  assert.ok(compareTags('v1.0.0', 'v0.99.0') > 0);
  assert.ok(compareTags('v0.2.1', 'v0.2.2') < 0);
  assert.equal(compareTags('v0.2.0', 'v0.2.0'), 0);
});

test('compareTags sorts a prerelease strictly before its final release', () => {
  assert.ok(compareTags('v0.4.0-beta.1', 'v0.4.0') < 0);
  assert.ok(compareTags('v0.4.0', 'v0.4.0-beta.1') > 0);
});

test('compareTags falls back to string order between two prereleases of the same base version', () => {
  assert.ok(compareTags('v0.4.0-beta.1', 'v0.4.0-beta.2') < 0);
});

test('computeVersionCode numbers the first release 1', () => {
  assert.equal(computeVersionCode([], 'v0.1.0'), 1);
});

test('computeVersionCode counts monotonically in push order when tags are already in semver order', () => {
  assert.equal(computeVersionCode(['v0.1.0'], 'v0.2.0'), 2);
  assert.equal(computeVersionCode(['v0.1.0', 'v0.2.0'], 'v0.3.0'), 3);
});

test('computeVersionCode orders a late-pushed hotfix tag before a newer release it followed', () => {
  // v0.4.0 was pushed first, then a hotfix v0.3.1 for the previous line was tagged after
  // it — the hotfix must still get a *lower* versionCode, or a device already on v0.4.0
  // would see the hotfix as an illegal downgrade.
  const allTags = ['v0.1.0', 'v0.2.0', 'v0.3.0', 'v0.4.0'];
  assert.equal(computeVersionCode(allTags, 'v0.4.0'), 4);
  assert.equal(computeVersionCode(allTags, 'v0.3.1'), 4); // slots between v0.3.0 and v0.4.0
});

test('computeVersionCode is stable when recomputed for a tag already present in the list', () => {
  const allTags = ['v0.1.0', 'v0.2.0', 'v0.3.0'];
  assert.equal(computeVersionCode(allTags, 'v0.2.0'), 2);
});

test('computeVersionCode ignores non-release tags mixed into the list', () => {
  const allTags = ['v0.1.0', 'not-a-release', 'ci-experiment', 'v0.2.0'];
  assert.equal(computeVersionCode(allTags, 'v0.3.0'), 3);
});

test('computeVersionCode throws when the target tag itself is malformed', () => {
  assert.throws(() => computeVersionCode(['v0.1.0'], 'garbage'), /Not a valid release tag/);
});

test('versionNameFromTag strips the leading v', () => {
  assert.equal(versionNameFromTag('v0.2.0'), '0.2.0');
  assert.equal(versionNameFromTag('v1.0.0-beta.1'), '1.0.0-beta.1');
});

test('versionNameFromTag throws on a malformed tag rather than returning garbage', () => {
  assert.throws(() => versionNameFromTag('0.2.0'), /Not a valid release tag/);
});
