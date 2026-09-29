/**
 * What the container image holds of the repo: only what the server runs. No test, recording or
 * the recorded-upstreams harness reaches it, and nothing the server runs imports the harness.
 * Run: node --test scripts/guards/image.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../plan/testing.mjs';
import { dockerignore, imageFiles, runtimeFiles, testOnly } from './image.mjs';

test('the image copies exactly the files server/src/main.ts runs, and their package manifests', () => {
  assert.deepEqual(imageFiles(REPO_ROOT), runtimeFiles(REPO_ROOT));
});

test('the image holds no test, recording, test key, recorder or recorded-upstreams harness', () => {
  assert.deepEqual(imageFiles(REPO_ROOT).filter(testOnly), []);
});

test('a test, a recording, the test key, the recorder and the harness are each test-only', () => {
  for (const file of [
    'server/src/app.test.ts',
    'server/src/adapters/jellyfin/recordings/users-list.json',
    'server/src/adapters/audiobookshelf/recordings/item-file.m4a',
    'server/src/adapters/http/test-signing-key.json',
    'server/src/adapters/http/testSigningKey.ts',
    'server/src/adapters/http/replay.ts',
    'server/src/adapters/record-cli.ts',
    'server/src/adapters/record-oidc.ts',
    'server/e2e/recorded.ts',
  ]) {
    assert.equal(testOnly(file), true, file);
  }
  for (const file of ['server/src/main.ts', 'server/src/adapters/http/fetch.ts']) {
    assert.equal(testOnly(file), false, file);
  }
});

test('`node scripts/guards/image.mjs` prints what the image must hold: the files main.ts runs', () => {
  const printed = execFileSync(process.execPath, [join(REPO_ROOT, 'scripts/guards/image.mjs')], {
    encoding: 'utf8',
  });
  assert.deepEqual(printed.trimEnd().split('\n'), runtimeFiles(REPO_ROOT));
});

test('nothing under server/src imports from server/e2e', () => {
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'server/src'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => /\.[cm]?[jt]s$/.test(f));
  const importing = files.filter((f) =>
    /from\s+['"][^'"]*\/e2e\/|import\(\s*['"][^'"]*\/e2e\//.test(
      readFileSync(join(REPO_ROOT, f), 'utf8'),
    ),
  );
  assert.deepEqual(importing, []);
});

test('a .dockerignore pattern matches the path, or a folder it sits in, anchored at the root', () => {
  const ignored = dockerignore('server/e2e\nnode_modules\n');
  assert.equal(ignored('server/e2e/recorded.ts'), true);
  assert.equal(ignored('server/e2e'), true);
  assert.equal(ignored('node_modules/zod/index.js'), true);
  assert.equal(ignored('server/node_modules/zod/index.js'), false);
  assert.equal(ignored('server/e2e2/x.ts'), false);
});

test('a .dockerignore `**` spans any folders and `*` stays inside one', () => {
  const ignored = dockerignore('server/src/**/*.test.ts\nserver/src/adapters/*/recordings\n');
  assert.equal(ignored('server/src/app.test.ts'), true);
  assert.equal(ignored('server/src/store/users.test.ts'), true);
  assert.equal(ignored('server/src/store/users.ts'), false);
  assert.equal(ignored('server/src/adapters/jellyfin/recordings/users-list.json'), true);
  assert.equal(ignored('server/src/adapters/a/b/recordings/x.json'), false);
});

test('a later `!` pattern lets a file back in, and the last match wins', () => {
  const ignored = dockerignore('# a comment\nhttp/*\n!http/fetch.ts\n');
  assert.equal(ignored('http/replay.ts'), true);
  assert.equal(ignored('http/fetch.ts'), false);
  assert.equal(dockerignore('!a.ts\n*.ts\n')('a.ts'), true);
});
