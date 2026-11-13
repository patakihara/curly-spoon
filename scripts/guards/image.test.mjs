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
import {
  dockerignore,
  imageFiles,
  runtimeFiles,
  testOnly,
  undeclaredGlobalArgs,
} from './image.mjs';

test('the image copies exactly the files server/src/main.ts runs, and their package manifests', () => {
  assert.deepEqual(imageFiles(REPO_ROOT), runtimeFiles(REPO_ROOT));
});

test("the extractor stands outside /app, each platform's archive pinned by its checksum", () => {
  const dockerfile = readFileSync(join(REPO_ROOT, 'Dockerfile'), 'utf8');
  const pinned = [...dockerfile.matchAll(/ADD --checksum=sha256:[0-9a-f]{64} \\\n\s+(\S+)/g)];
  assert.deepEqual(
    pinned.map((match) => match[1].split('/').at(-1)),
    ['yt-dlp_musllinux.zip', 'yt-dlp_musllinux_aarch64.zip'],
  );
  assert.match(dockerfile, /^COPY --from=extractor \/opt\/yt-dlp \/opt\/yt-dlp$/m);
  assert.match(dockerfile, /^ENV EXTRACTOR_PATH=\/opt\/yt-dlp\//m);
});

test('a stage that uses a global ARG names it again first, or it expands empty', () => {
  const dockerfile = readFileSync(join(REPO_ROOT, 'Dockerfile'), 'utf8');
  assert.deepEqual(undeclaredGlobalArgs(dockerfile), []);
});

test('a global ARG counts as undeclared only in a stage that uses it before naming it', () => {
  const dockerfile = [
    'ARG IMAGE=alpine',
    'ARG VERSION=1',
    '# a comment naming ${VERSION}',
    'FROM ${IMAGE} AS forgets',
    'RUN echo ${VERSION} $VERSION $OTHER',
    'FROM ${IMAGE} AS names',
    'ARG VERSION',
    'RUN echo ${VERSION}',
    'FROM ${IMAGE} AS late',
    'RUN echo ${VERSION}',
    'ARG VERSION',
  ].join('\n');
  assert.deepEqual(undeclaredGlobalArgs(dockerfile), [
    'forgets: VERSION',
    'forgets: VERSION',
    'late: VERSION',
  ]);
});

test('the image holds no test, recording, test key, recorder or recorded-upstreams harness', () => {
  assert.deepEqual(imageFiles(REPO_ROOT).filter(testOnly), []);
});

test('a test, a recording, a fixture, the test key, the recorder and the harness are each test-only', () => {
  for (const file of [
    'server/src/app.test.ts',
    'server/src/adapters/jellyfin/recordings/users-list.json',
    'server/src/adapters/audiobookshelf/recordings/item-file.m4a',
    'server/src/requests/albums/fixtures/the-slip/01 - 999,999.flac',
    'server/src/adapters/http/test-signing-key.json',
    'server/src/adapters/http/testSigningKey.ts',
    'server/src/adapters/http/replay.ts',
    'server/src/adapters/record-cli.ts',
    'server/src/adapters/record-oidc.ts',
    'server/e2e/recorded.ts',
  ]) {
    assert.equal(testOnly(file), true, file);
  }
  for (const file of [
    'server/src/main.ts',
    'server/src/adapters/http/entities.ts',
    'server/src/adapters/http/fetch.ts',
    'server/src/adapters/http/publicFetch.ts',
    'server/src/adapters/http/unavailable.ts',
  ]) {
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

test("the image's last stage takes AURALIS_COMMIT as a build argument and hands it to the server", () => {
  const dockerfile = readFileSync(join(REPO_ROOT, 'Dockerfile'), 'utf8');
  const final = dockerfile.slice(dockerfile.lastIndexOf('\nFROM '));
  assert.match(final, /^ARG AURALIS_COMMIT$/m);
  assert.match(final, /^(?:ENV)?\s+AURALIS_COMMIT=\$\{AURALIS_COMMIT\}/m);
});

test('every workflow that builds the image passes the commit it builds as AURALIS_COMMIT', () => {
  const expected = {
    'ci.yml': '${{ github.sha }}',
    'publish.yml': '${{ github.event.workflow_run.head_sha }}',
    'release.yml': '${{ github.sha }}',
  };
  for (const [file, commit] of Object.entries(expected)) {
    const text = readFileSync(join(REPO_ROOT, '.github/workflows', file), 'utf8');
    const builds =
      text.match(/^\s*(?:run: docker build |- uses: docker\/build-push-action)/gm) ?? [];
    const passes = text.split(`AURALIS_COMMIT=${commit}`).length - 1;
    assert.ok(builds.length > 0, `${file} builds the image`);
    assert.equal(passes, builds.length, `${file} passes AURALIS_COMMIT=${commit} to every build`);
  }
});
