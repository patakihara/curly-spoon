/**
 * Tests for the bundle-budget checker's pure logic: entry-asset detection from
 * `index.html`, bucketing measured files into entry/lazy/total, and the
 * pass/fail comparison against a budget. Deliberately does not touch a real
 * `dist/` directory — every function under test takes plain data in and returns
 * plain data out, so a fabricated `index.html` string and a fabricated file list
 * are enough to pin the behaviour without a build step.
 *
 * Uses Node's built-in test runner (`node:test`/`node:assert`) rather than
 * Vitest: this file lives under `scripts/`, outside `vitest.config.ts`'s
 * `include` globs (each workspace package's own `src/`), the
 * same reasoning `scripts/hooks/*.test.sh` already follows for hook scripts —
 * standalone tooling gets a standalone, self-contained test runner rather than
 * a new include glob pointed at `scripts/`.
 *
 * Run directly:
 *   node --test scripts/bundle-budget.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readEntryAssetNames,
  bucketize,
  formatBytes,
  evaluateBudget,
  formatReport,
} from './bundle-budget.mjs';

test('readEntryAssetNames pulls the module script and stylesheet basenames out of index.html', () => {
  const html = `<!doctype html>
<html>
  <head>
    <script type="module" crossorigin src="/assets/index-DuoqEb65.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-CJK61ROv.css">
  </head>
  <body></body>
</html>`;
  const result = readEntryAssetNames(html);
  assert.deepEqual(result.js, ['index-DuoqEb65.js']);
  assert.deepEqual(result.css, ['index-CJK61ROv.css']);
});

test('readEntryAssetNames ignores non-module scripts and non-stylesheet links', () => {
  const html = `<script src="/some/analytics.js"></script>
<script type="module" src="/assets/entry-abc.js"></script>
<link rel="icon" href="/icons/icon-192.png" />
<link rel="stylesheet" href="/assets/entry-def.css">`;
  const result = readEntryAssetNames(html);
  assert.deepEqual(result.js, ['entry-abc.js']);
  assert.deepEqual(result.css, ['entry-def.css']);
});

test('bucketize sums entry vs. lazy files and finds the largest lazy chunk', () => {
  const files = [
    { name: 'index-abc.js', raw: 700_000, gzip: 210_000, isEntry: true },
    { name: 'index-def.css', raw: 260_000, gzip: 39_000, isEntry: true },
    { name: 'SettingsPage-x.js', raw: 13_000, gzip: 4_000, isEntry: false },
    { name: 'HomePage-y.js', raw: 3_800, gzip: 1_700, isEntry: false },
  ];
  const result = bucketize(files);
  assert.equal(result.entry.raw, 960_000);
  assert.equal(result.entry.gzip, 249_000);
  assert.equal(result.lazy.raw, 16_800);
  assert.equal(result.lazy.gzip, 5_700);
  assert.equal(result.total.raw, 976_800);
  assert.equal(result.total.gzip, 254_700);
  assert.equal(result.largestLazy.name, 'SettingsPage-x.js');
  assert.equal(result.largestLazy.raw, 13_000);
});

test('bucketize reports no largest lazy chunk when every file is an entry file', () => {
  const files = [{ name: 'index-abc.js', raw: 100, gzip: 50, isEntry: true }];
  const result = bucketize(files);
  assert.equal(result.largestLazy, null);
});

test('formatBytes renders sub-KB sizes in bytes and larger sizes in KB with one decimal', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1023), '1023 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(327_680), '320.0 KB');
  assert.equal(formatBytes(252_967), '247.0 KB');
});

test('evaluateBudget passes every metric under its limit', () => {
  const measured = {
    entry: { raw: 900_000, gzip: 240_000 },
    total: { raw: 1_000_000, gzip: 270_000 },
    largestLazy: { name: 'SettingsPage-x.js', raw: 13_000, gzip: 4_000 },
  };
  const budgetConfig = {
    entryRawBytes: 1_228_800,
    entryGzipBytes: 327_680,
    totalRawBytes: 1_433_600,
    totalGzipBytes: 389_120,
    largestLazyChunkRawBytes: 61_440,
  };
  const results = evaluateBudget(measured, budgetConfig);
  assert.equal(results.length, 5);
  assert.ok(results.every((r) => r.pass));
  assert.ok(results.every((r) => r.overBy === 0));
});

test('evaluateBudget fails exactly the metrics over their limit, with the correct overBy', () => {
  const measured = {
    entry: { raw: 900_000, gzip: 400_000 }, // gzip over
    total: { raw: 1_000_000, gzip: 270_000 },
    largestLazy: { name: 'Big-x.js', raw: 90_000, gzip: 4_000 }, // raw over
  };
  const budgetConfig = {
    entryRawBytes: 1_228_800,
    entryGzipBytes: 327_680,
    totalRawBytes: 1_433_600,
    totalGzipBytes: 389_120,
    largestLazyChunkRawBytes: 61_440,
  };
  const results = evaluateBudget(measured, budgetConfig);
  const byKey = Object.fromEntries(results.map((r) => [r.key, r]));
  assert.equal(byKey.entryGzipBytes.pass, false);
  assert.equal(byKey.entryGzipBytes.overBy, 400_000 - 327_680);
  assert.equal(byKey.largestLazyChunkRawBytes.pass, false);
  assert.equal(byKey.largestLazyChunkRawBytes.overBy, 90_000 - 61_440);
  assert.equal(byKey.entryRawBytes.pass, true);
  assert.equal(byKey.totalRawBytes.pass, true);
  assert.equal(byKey.totalGzipBytes.pass, true);
});

test('evaluateBudget treats an exactly-at-limit value as passing (limit is inclusive)', () => {
  const measured = {
    entry: { raw: 1_228_800, gzip: 200_000 },
    total: { raw: 1_000_000, gzip: 270_000 },
    largestLazy: { name: 'x.js', raw: 1_000, gzip: 500 },
  };
  const budgetConfig = {
    entryRawBytes: 1_228_800,
    entryGzipBytes: 327_680,
    totalRawBytes: 1_433_600,
    totalGzipBytes: 389_120,
    largestLazyChunkRawBytes: 61_440,
  };
  const results = evaluateBudget(measured, budgetConfig);
  const entryRaw = results.find((r) => r.key === 'entryRawBytes');
  assert.equal(entryRaw.pass, true);
});

test('formatReport names what grew, by how much, against what limit, when something fails', () => {
  const results = [
    {
      key: 'entryGzipBytes',
      label: 'entry, gzip',
      value: 400_000,
      limit: 327_680,
      pass: false,
      overBy: 72_320,
    },
    {
      key: 'totalRawBytes',
      label: 'total, raw',
      value: 100,
      limit: 1_433_600,
      pass: true,
      overBy: 0,
    },
  ];
  const report = formatReport(results, { name: 'HeavyPage-z.js', raw: 90_000, gzip: 4_000 });
  assert.match(report, /entry, gzip/);
  assert.match(report, /OVER/);
  assert.match(report, /exceeds the 320\.0 KB budget by 70\.6 KB/);
  assert.match(report, /HeavyPage-z\.js/);
});

test('formatReport has no "Over budget" section when everything passes', () => {
  const results = [{ key: 'a', label: 'a', value: 1, limit: 2, pass: true, overBy: 0 }];
  const report = formatReport(results, null);
  assert.doesNotMatch(report, /Over budget/);
});
