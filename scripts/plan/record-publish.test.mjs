/**
 * Recording a publish in design/published.json, and the check that the published plan is the
 * current one. Run: node --test scripts/plan/record-publish.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, combineTrees, recordPublish, sourcesTree } from './record-publish.mjs';
import { read, removeTree, REPO_ROOT, write } from './testing.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'record-publish.mjs');
const URL_ = 'https://claude.ai/artifact/example';
const STAMP = {
  commit: 'c'.repeat(40),
  tree: 'd'.repeat(40),
  renderedAt: '2026-01-04T00:00:00.000Z',
  draft: false,
};

test('[M0.plan/d] design/published.json records the current tree of docs/plan and docs/outbox', () => {
  const published = JSON.parse(readFileSync(join(REPO_ROOT, 'design/published.json'), 'utf8'));
  assert.equal(published.plan?.tree, sourcesTree(REPO_ROOT, SOURCES.plan));
});

test('the combined tree changes when either the plan or the outbox changes', () => {
  const plan = ['docs/plan', 'a'.repeat(40)];
  const outbox = ['docs/outbox', 'b'.repeat(40)];
  const base = combineTrees([plan, outbox]);
  assert.match(base, /^[0-9a-f]{40}$/);
  assert.equal(combineTrees([plan, outbox]), base);
  assert.notEqual(combineTrees([['docs/plan', 'c'.repeat(40)], outbox]), base);
  assert.notEqual(combineTrees([plan, ['docs/outbox', 'c'.repeat(40)]]), base);
  assert.notEqual(combineTrees([plan, ['docs/outbox', null]]), base);
  assert.equal(combineTrees([['docs/plan', null]]), null);
});

function inTree(fn) {
  const root = mkdtempSync(join(tmpdir(), 'plan-publish-'));
  try {
    return fn(root);
  } finally {
    removeTree(root);
  }
}

test('recording a publish writes the stamp, url and version under the artifact key', () =>
  inTree((root) => {
    write(root, 'design/published.json', '{}\n');
    recordPublish({
      root,
      artifact: 'plan',
      url: URL_,
      version: '7',
      stamp: STAMP,
      now: new Date('2026-01-05T00:00:00Z'),
    });
    assert.equal(
      read(root, 'design/published.json'),
      `${JSON.stringify(
        {
          plan: {
            url: URL_,
            sources: ['docs/plan', 'docs/outbox'],
            commit: STAMP.commit,
            tree: STAMP.tree,
            version: '7',
            publishedAt: '2026-01-05T00:00:00.000Z',
          },
        },
        null,
        2,
      )}\n`,
    );
  }));

test('other artifacts are kept, keys stay sorted, and a design publish records its own source', () =>
  inTree((root) => {
    write(
      root,
      'design/published.json',
      `${JSON.stringify({ sonora: { url: 'u', sources: ['design/sonora'], version: '5' } })}\n`,
    );
    recordPublish({ root, artifact: 'plan', url: URL_, version: '1', stamp: STAMP });
    const canvasStamp = { ...STAMP, sonora: { version: '5', tree: 'e'.repeat(40) } };
    recordPublish({ root, artifact: 'canvas', url: URL_, version: '2', stamp: canvasStamp });
    const published = JSON.parse(read(root, 'design/published.json'));
    assert.deepEqual(Object.keys(published), ['canvas', 'plan', 'sonora']);
    assert.deepEqual(published.canvas.sources, ['design/app', 'web/public/art']);
    assert.equal(published.sonora.url, 'u');
  }));

test('a canvas publish records the Sonora publish it installs', () =>
  inTree((root) => {
    write(root, 'design/published.json', `${JSON.stringify({ sonora: { version: '9-ab' } })}\n`);
    const stamp = { ...STAMP, sonora: { version: '9-ab', tree: 'e'.repeat(40) } };
    recordPublish({ root, artifact: 'canvas', url: URL_, version: '3', stamp });
    assert.deepEqual(JSON.parse(read(root, 'design/published.json')).canvas.installs, {
      sonora: '9-ab',
    });
  }));

test('a canvas built on a Sonora other than the one published is never recorded', () =>
  inTree((root) => {
    const before = `${JSON.stringify({ sonora: { version: '9-ab' } })}\n`;
    write(root, 'design/published.json', before);
    const record = (sonora) => () =>
      recordPublish({
        root,
        artifact: 'canvas',
        url: URL_,
        version: '3',
        stamp: { ...STAMP, sonora },
      });
    assert.throws(
      record({ version: '8-old', tree: 'e'.repeat(40) }),
      /installs sonora 8-old, but sonora is published at 9-ab/,
    );
    assert.throws(record(undefined), /installs sonora none, but sonora is published at 9-ab/);
    assert.equal(read(root, 'design/published.json'), before);
  }));

test('a draft render is never recorded as published', () =>
  inTree((root) => {
    write(root, 'design/published.json', '{}\n');
    assert.throws(
      () =>
        recordPublish({
          root,
          artifact: 'plan',
          url: URL_,
          version: '1',
          stamp: { ...STAMP, draft: true },
        }),
      /draft/,
    );
    assert.equal(read(root, 'design/published.json'), '{}\n');
  }));

test('the CLI reads the stamp file and records the publish', () =>
  inTree((root) => {
    write(root, 'design/published.json', '{}\n');
    write(root, 'build/plan/stamp.json', JSON.stringify(STAMP));
    execFileSync(
      'node',
      [
        CLI,
        '--root',
        root,
        '--artifact',
        'plan',
        '--url',
        URL_,
        '--version',
        '3',
        '--stamp',
        'build/plan/stamp.json',
      ],
      {
        stdio: 'pipe',
      },
    );
    assert.equal(JSON.parse(read(root, 'design/published.json')).plan.version, '3');
  }));
