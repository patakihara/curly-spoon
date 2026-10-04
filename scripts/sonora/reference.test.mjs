/**
 * Sonora's reference cards are generated from docs/gen_screens.py and docs/examples/*.snippet.jsx
 * by docs/gen_reference_cards.py. The committed cards must equal a fresh run, so a snippet change
 * cannot leave them stale. Run: node --test scripts/sonora/reference.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT, removeTree } from '../plan/testing.mjs';

const SONORA = join(REPO_ROOT, 'design/sonora');
const COMMITTED = join(SONORA, 'reference');

test('[M0.sonoraclean/d] the committed reference cards equal a fresh gen_reference_cards.py run', () => {
  const out = mkdtempSync(join(tmpdir(), 'sonora-reference-'));
  try {
    const run = spawnSync('python3', [join(SONORA, 'docs/gen_reference_cards.py'), '--out', out], {
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    const fresh = readdirSync(out).sort();
    const committed = readdirSync(COMMITTED)
      .filter((f) => f.endsWith('.card.html'))
      .sort();
    assert.deepEqual(committed, fresh, 'reference/ holds exactly the generated cards');
    const stale = fresh.filter(
      (f) => readFileSync(join(out, f), 'utf8') !== readFileSync(join(COMMITTED, f), 'utf8'),
    );
    assert.deepEqual(
      stale,
      [],
      'regenerate with python3 design/sonora/docs/gen_reference_cards.py',
    );
  } finally {
    removeTree(out);
  }
});
