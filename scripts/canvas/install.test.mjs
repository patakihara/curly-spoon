/**
 * Which Sonora publish the canvas build installs: only the one design/published.json records,
 * built from the same tree. Run: node --test scripts/canvas/install.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sonoraInstall } from './install.mjs';

const RECORD = { url: 'https://claude.ai/artifact/sonora', tree: 'a'.repeat(40), version: '7-ab' };
const BUILT = { commit: 'c'.repeat(40), tree: 'a'.repeat(40), draft: false };

test('the canvas installs the recorded Sonora publish when build/sonora is that publish', () => {
  assert.deepEqual(sonoraInstall({ published: { sonora: RECORD }, sonoraStamp: BUILT }), {
    title: 'Sonora',
    artifact: RECORD.url,
    version: '7-ab',
    tree: RECORD.tree,
  });
});

test('the canvas refuses a Sonora that is not published, not built, a draft or another tree', () => {
  const install = (published, sonoraStamp) => () => sonoraInstall({ published, sonoraStamp });
  assert.throws(install({}, BUILT), /Sonora has no recorded publish/);
  assert.throws(install({ sonora: RECORD }, null), /run pnpm sonora:build/);
  assert.throws(install({ sonora: RECORD }, { ...BUILT, draft: true }), /draft/);
  assert.throws(
    install({ sonora: RECORD }, { ...BUILT, tree: 'b'.repeat(40) }),
    /build\/sonora is tree bbbbbbb, but Sonora is published at tree aaaaaaa/,
  );
});

test('a draft canvas installs whatever build/sonora holds, and names no version', () => {
  assert.deepEqual(sonoraInstall({ published: {}, sonoraStamp: null, draft: true }), {
    title: 'Sonora',
    artifact: null,
    version: null,
    tree: null,
  });
});
