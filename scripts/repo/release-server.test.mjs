/**
 * The Android release names the server it signs in to. The repo is public, so the address comes
 * from the `AURALIS_SERVER` repository secret, never from a file here: every release workflow
 * hands it to the release build, and checks it is set before building anything.
 * Run: node --test scripts/repo/release-server.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RELEASES = ['.github/workflows/release.yml', '.github/workflows/fdroid-repo.yml'];

/** Each step of a workflow, as its own lines: from one `- ` at step indent to the next, or a comment. */
function steps(file) {
  const out = [];
  let current = null;
  for (const line of readFileSync(join(root, file), 'utf8').split('\n')) {
    if (/^ {6}- /.test(line)) {
      current = [line];
      out.push(current);
    } else if (/^ {0,4}\S/.test(line) || /^ {6}#/.test(line)) {
      current = null;
    } else if (current !== null) {
      current.push(line);
    }
  }
  return out.map((lines) => lines.join('\n'));
}

for (const file of RELEASES) {
  test(`[M0.repo/e] ${file} builds the release with the server from the AURALIS_SERVER secret`, () => {
    const builds = steps(file).filter((s) => /\bassembleRelease\b/.test(s));
    assert.ok(builds.length > 0, `${file} has no release build step`);
    for (const step of builds) {
      assert.match(step, /^\s+AURALIS_SERVER: \$\{\{ secrets\.AURALIS_SERVER \}\}$/m);
      assert.match(step, /-PauralisServer="\$AURALIS_SERVER"/);
    }
  });

  test(`[M0.repo/e] ${file} stops before building when AURALIS_SERVER is not set`, () => {
    const checks = steps(file).filter((s) => /missing\+=/.test(s));
    assert.ok(
      checks.some((s) =>
        s.includes('[ -z "${{ secrets.AURALIS_SERVER }}" ] && missing+=("AURALIS_SERVER")'),
      ),
      `${file}'s secret check does not name AURALIS_SERVER`,
    );
  });
}

test('[M0.repo/e] no release workflow passes the server any other way', () => {
  for (const file of RELEASES) {
    const text = readFileSync(join(root, file), 'utf8');
    assert.doesNotMatch(text, /-PauralisServer=(?!"\$AURALIS_SERVER")/, file);
  }
});
