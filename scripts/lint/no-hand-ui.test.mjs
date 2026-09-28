/**
 * The web app draws no UI by hand: files in web/src outside generated/ may compose generated pages
 * and Sonora components only. Run: node --test scripts/lint/no-hand-ui.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { REPO_ROOT } from '../plan/testing.mjs';

const fixture = (name) => readFileSync(join(REPO_ROOT, 'scripts/lint/fixtures', name), 'utf8');
const eslint = new ESLint({ cwd: REPO_ROOT });

/** The no-hand-ui findings for `source` linted as if it lived at `filePath`, as `line:rule text`. */
async function handUi(source, filePath) {
  const [result] = await eslint.lintText(source, { filePath: join(REPO_ROOT, filePath) });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === 'auralis/no-hand-ui')
    .map((m) => `${m.line}: ${m.message}`);
}

test('a web/src file that draws HTML elements or styles them is refused', async () => {
  assert.deepEqual(await handUi(fixture('HandMade.tsx'), 'web/src/HandMade.tsx'), [
    '7: <div> is hand-drawn UI: add it to the design and compose the generated page or a Sonora component',
    '7: className styles by hand: styling belongs to Sonora',
    '8: <span> is hand-drawn UI: add it to the design and compose the generated page or a Sonora component',
    '8: style styles by hand: styling belongs to Sonora',
    "10: createElement('section') is hand-drawn UI: add it to the design and compose the generated page or a Sonora component",
  ]);
});

test('a web/src file composing generated pages and Sonora components passes', async () => {
  assert.deepEqual(await handUi(fixture('Composed.tsx'), 'web/src/Composed.tsx'), []);
});

test('generated code and the allowlisted test files are not checked', async () => {
  assert.deepEqual(await handUi(fixture('HandMade.tsx'), 'web/src/generated/pages/X.tsx'), []);
  assert.deepEqual(await handUi(fixture('HandMade.tsx'), 'web/src/HandMade.test.tsx'), []);
});

test('the web app as it stands draws nothing by hand', async () => {
  const results = await eslint.lintFiles(['web/src']);
  const found = results.flatMap((r) =>
    r.messages
      .filter((m) => m.ruleId === 'auralis/no-hand-ui')
      .map((m) => `${r.filePath}:${m.line}`),
  );
  assert.deepEqual(found, []);
});
