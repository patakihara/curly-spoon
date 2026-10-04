/**
 * Sonora's adherence rules (_adherence.oxlintrc.json) are generated from the component `.d.ts`
 * files by docs/gen_adherence.py. The committed file must equal a fresh run, so a changed, added
 * or removed prop cannot leave a rule stale. Run: node --test scripts/sonora/adherence.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT, removeTree } from '../plan/testing.mjs';

const SONORA = join(REPO_ROOT, 'design/sonora');
const COMMITTED = join(SONORA, '_adherence.oxlintrc.json');

test('[M0.sonoraclean/d] the committed adherence rules equal a fresh gen_adherence.py run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonora-adherence-'));
  try {
    const out = join(dir, '_adherence.oxlintrc.json');
    const run = spawnSync('python3', [join(SONORA, 'docs/gen_adherence.py'), '--out', out], {
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(
      readFileSync(out, 'utf8'),
      readFileSync(COMMITTED, 'utf8'),
      'regenerate with python3 design/sonora/docs/gen_adherence.py',
    );
  } finally {
    removeTree(dir);
  }
});
