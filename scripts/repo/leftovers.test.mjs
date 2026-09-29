/**
 * Nothing removed lingers: a Sonora component deleted from design/sonora is named nowhere in the
 * apps or the canvas, every exception an ignore file carves out names a file that exists, and no
 * tracked file names a machine, a user, a home folder or a personal email (the repo is public).
 * Reads Sonora's history, so CI's checkout needs full history (fetch-depth: 0).
 * Run: node --test scripts/repo/leftovers.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const lines = (s) => s.split('\n').filter(Boolean);

/** Where the apps and the canvas use Sonora's components by name. */
const USERS = ['web/src', 'android', 'design/app', 'server/src', 'schema'];
const COMPONENT = /^design\/sonora\/components\/.*\/([A-Z][A-Za-z0-9]*)\.(?:d\.ts|jsx)$/;

/** Component names Sonora's history has deleted, with no component of that name left today. */
function deletedComponents() {
  const named = (paths) =>
    new Set(paths.map((p) => COMPONENT.exec(p)?.[1]).filter((n) => n !== undefined));
  const deleted = named(
    lines(git('log', '--diff-filter=D', '--name-only', '--format=', '--', 'design/sonora')),
  );
  const live = named(lines(git('ls-files', 'design/sonora/components')));
  return [...deleted].filter((n) => !live.has(n)).sort();
}

test('Sonora has deleted components to check for', () => {
  assert.ok(deletedComponents().length > 0);
});

test('no deleted Sonora component is named in the apps or the canvas', () => {
  const found = deletedComponents().flatMap((name) => {
    let hits = '';
    try {
      hits = git('grep', '-l', '-w', '-I', name, '--', ...USERS);
    } catch {
      // git grep exits 1 when nothing matches.
    }
    return lines(hits).map((file) => `${name} in ${file}`);
  });
  assert.deepEqual(found, []);
});

test('every exception in .gitignore and .dockerignore names a file that exists', () => {
  const missing = ['.gitignore', '.dockerignore'].flatMap((file) =>
    readFileSync(join(root, file), 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('!'))
      .map((line) => line.slice(1))
      .filter((path) => !existsSync(join(root, path)))
      .map((path) => `${basename(file)}: !${path}`),
  );
  assert.deepEqual(missing, []);
});

/** What a public repo must not carry: host names, user names, home folders, personal emails. */
const PRIVATE = [
  { what: 'the user name', re: /sofiapata/gi },
  { what: 'the laptop host name', re: /sofiathinkpad|thinkpad:/gi },
  { what: 'a home folder', re: /\/home\/[^/\s'"`)]*/g },
  { what: 'a mediaserver host path', re: /\bmediaserver:[~/][^\s'"`)]*/g },
  { what: 'a personal email', re: /\bpatakihara@(?!users\.noreply\.github\.com)[\w.-]+/g },
  { what: 'an email', re: /[\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b/g },
];

/** Emails that name nobody: GitHub's noreply addresses, the commit trailer's, reserved domains. */
const NOBODY =
  /(?:@users\.noreply\.github\.com|^noreply@anthropic\.com|@(?:[\w-]+\.)*(?:example\.(?:com|org|net)|example-household\.test|example|invalid|test))$/;

/** The one file allowed to name what the guard looks for: this one. */
const SELF = 'scripts/repo/leftovers.test.mjs';

/** Where a match is unavoidable: each is a file, the exact text matched, and why it stays. */
const EXCEPTIONS = [
  ...['sofiathinkpad', 'sofiathinkpad@sofiathinkpad.local', 'mediaserver@mediaserver.local'].map(
    (match) => ({
      file: 'scripts/repo/identities.json',
      match,
      why: "Sonora's commit authors, already public in git history, which layout.test.mjs checks",
    }),
  ),
  ...[
    ['scripts/mediaserver/abs-api-key.test.mjs', '/home/test'],
    ['server/src/adapters/http/localNames.test.ts', '/home/u'],
    ['server/src/adapters/http/leaks.test.ts', '/home/alice'],
    ['server/src/adapters/http/scan.test.ts', '/home/someone'],
    ['server/src/adapters/http/scrub.test.ts', '/home/someone'],
    ['server/src/adapters/http/scrub.test.ts', '/home/user'],
    ['server/src/adapters/http/scrub.ts', '/home/<user>'],
  ].map(([file, match]) => ({
    file,
    match,
    why: 'a made-up home folder the scrubber is tested on',
  })),
  ...[
    ['server/src/adapters/http/scan.test.ts', 'ab@cd.ef'],
    ['server/src/adapters/http/scan.test.ts', 'jk@lm.io'],
    ['server/src/adapters/http/scrub.test.ts', 'ab@cd.ef'],
    ['server/src/adapters/http/scrub.test.ts', 'jk@lm.io'],
    ['server/src/adapters/http/scrub.test.ts', 'a@b.com'],
  ].map(([file, match]) => ({ file, match, why: 'a made-up email the scrubber is tested on' })),
  { file: 'pnpm-lock.yaml', match: 'i@izs.me', why: "a package's deprecation notice, generated" },
];

/** Every private-looking match in tracked text files, as `file: match (what)`. */
function privateMatches() {
  return lines(git('ls-files'))
    .filter((file) => file !== SELF && existsSync(join(root, file)))
    .flatMap((file) => {
      const text = readFileSync(join(root, file), 'utf8');
      if (text.includes('\0')) return [];
      return PRIVATE.flatMap(({ what, re }) =>
        [...text.matchAll(re)]
          .map(([match]) => match)
          .filter((match) => what !== 'an email' || !NOBODY.test(match))
          .map((match) => ({ file, match, what })),
      );
    });
}

const excepted = (hit) => EXCEPTIONS.some((e) => e.file === hit.file && e.match === hit.match);

test('no tracked file names a host, a user, a home folder or a personal email', () => {
  const found = privateMatches()
    .filter((hit) => !excepted(hit))
    .map(({ file, match, what }) => `${file}: ${match} (${what})`);
  assert.deepEqual([...new Set(found)], []);
});

test('every exception to that still matches something', () => {
  const hits = privateMatches();
  const stale = EXCEPTIONS.filter(
    (e) => !hits.some((h) => h.file === e.file && h.match === e.match),
  );
  assert.deepEqual(stale, []);
});
