/**
 * Diffs extension/lib/queue.js's buildPrompt(entry) against docs/serve.py's own
 * build_prompt(entry) — the real Python function, called through
 * docs/build_prompt_cli.py (docs/EXTENSION-PLAN.md §4 "1.4") — for three sample
 * entries covering the shapes a gallery `sonora:feedback` message actually sends:
 * text only, element only, and both. Must be byte-identical; this is the "real run,
 * never a mock" check the plan requires for the JS port (memory:
 * verify-against-real-input-not-mocks).
 *
 *   ~/.local/share/node22/bin/node extension/test/check_build_prompt.mjs
 */
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const { buildPrompt } = require('../lib/queue.js');

const ENTRIES = [
  {
    name: 'text only',
    entry: { name: 'ProfileCard', path: 'components/ProfileCard.jsx', text: 'Make the avatar bigger' },
  },
  {
    name: 'element only, no text',
    entry: {
      name: 'HeaderNav',
      path: 'components/HeaderNav.jsx',
      text: '',
      element: '→ button.nav-link "Pricing"\n  ↑ nav.header-links\n    ↑ header#site-header',
    },
  },
  {
    name: 'text and element',
    entry: {
      name: 'PricingTable',
      path: 'guidelines/pricing.html',
      text: 'Row spacing feels too tight — use the standard token, not a hardcoded 6px',
      element: '→ div.pricing-row',
    },
  },
];

function pythonBuildPrompt(entry) {
  const result = spawnSync('python3', ['docs/build_prompt_cli.py', JSON.stringify(entry)], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`docs/build_prompt_cli.py exited ${result.status}: ${result.stderr}`);
  }
  return result.stdout;
}

let failures = 0;
for (const { name, entry } of ENTRIES) {
  const js = buildPrompt(entry);
  const py = pythonBuildPrompt(entry);
  const same = js === py;
  console.log(`${same ? 'PASS' : 'FAIL'}  ${name}`);
  if (!same) {
    failures++;
    console.log(`  JS (${js.length} chars): ${JSON.stringify(js)}`);
    console.log(`  PY (${py.length} chars): ${JSON.stringify(py)}`);
  }
}

console.log(failures ? `\n${failures} of ${ENTRIES.length} FAILED.` : `\nAll ${ENTRIES.length} entries byte-identical.`);
process.exit(failures ? 1 : 0);
