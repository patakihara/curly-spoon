/**
 * The plan checks. The first test runs them on the real `docs/plan`; the rest show each rule
 * failing on a bad synthetic tree and passing on the good fixture.
 * Run: node --test scripts/plan/lint.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintPlan, WORD_LIMIT } from './lint.mjs';
import { edit, fixtureTree, removeTree, REPO_ROOT, tag, write } from './testing.mjs';

test('[M0.plan/a] the real plan passes every check', (t) => {
  const { errors, words, notices } = lintPlan(REPO_ROOT);
  t.diagnostic(
    `docs/plan: ${words} words (limit ${WORD_LIMIT})${notices.length ? `; ${notices.join('; ')}` : ''}`,
  );
  assert.deepEqual(errors, []);
});

/** Lints the fixture tree after `change(root)`, and cleans up. */
function lintAfter(change = () => {}) {
  const root = fixtureTree();
  try {
    change(root);
    return lintPlan(root);
  } finally {
    removeTree(root);
  }
}

const planFile = (name) => `docs/plan/${name}`;
const replaceIn = (name, from, to) => (root) =>
  edit(root, planFile(name), (t) => t.replace(from, to));
const appendTo = (name, text) => (root) => edit(root, planFile(name), (t) => t + text);

function assertFails(result, pattern) {
  assert.ok(
    result.errors.some((e) => pattern.test(e)),
    `expected an error matching ${pattern}, got:\n${result.errors.join('\n') || '(none)'}`,
  );
}

test('the fixture plan passes every check and reports its word count', () => {
  const result = lintAfter();
  assert.deepEqual(result.errors, []);
  assert.ok(result.words > 300 && result.words < 1000, `words: ${result.words}`);
});

test('a docs/plan holding only its README is a clean pass with a notice', () => {
  const result = lintAfter((root) => {
    for (const f of ['_header.md', '00-intro.md', '01-flow.md', '02-milestones.md']) {
      rmSync(join(root, 'docs/plan', f));
    }
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.words, 0);
  assert.match(result.notices.join('\n'), /no sections yet/);
});

test('structure: the header needs its four keys', () => {
  assertFails(
    lintAfter(replaceIn('_header.md', 'brand-sub: Test plan\n', '')),
    /_header\.md:1: .*title, eyebrow, brand, brand-sub/,
  );
});

test('structure: section numbers run from 00 without gaps', () => {
  const result = lintAfter((root) => {
    const text = `---\nid: gap\nnav: Gap\npart: Delivery\n---\n## Gap\n`;
    write(root, planFile('05-gap.md'), text);
  });
  assertFails(result, /05-gap\.md:1: section numbers run from 00 without gaps/);
});

test('structure: the id must match the filename', () => {
  assertFails(
    lintAfter(replaceIn('01-flow.md', 'id: flow', 'id: flows')),
    /01-flow\.md:2: id "flows" must match/,
  );
});

test('structure: exactly one `##`, and it comes first', () => {
  assertFails(
    lintAfter(appendTo('01-flow.md', '\n## Another\n')),
    /01-flow\.md:\d+: a section has exactly one `## `/,
  );
  assertFails(
    lintAfter(replaceIn('01-flow.md', '## Flow & tables\n', 'Text first.\n\n## Flow & tables\n')),
    /first content line is the `## ` heading/,
  );
});

test('directives: only the closed set is allowed', () => {
  assertFails(
    lintAfter(appendTo('01-flow.md', '\n::: aside\nx\n:::\n')),
    /unknown directive "::: aside"/,
  );
  assert.deepEqual(lintAfter(appendTo('01-flow.md', '\n::: small\n- x\n:::\n')).errors, []);
});

test('directives: every block is closed and every close has a block', () => {
  assertFails(
    lintAfter(appendTo('01-flow.md', '\n::: card\nopen\n')),
    /`::: card` is never closed/,
  );
  assertFails(lintAfter(appendTo('01-flow.md', '\n:::\n')), /`:::` closes nothing/);
});

test('directives: a diagram names a file, and every file is used exactly once', () => {
  assertFails(
    lintAfter(appendTo('01-flow.md', '\n::: diagram nowhere\n')),
    /diagrams\/nowhere\.svg does not exist/,
  );
  assertFails(
    lintAfter(appendTo('00-intro.md', '\n::: diagram flow\n')),
    /diagrams\/flow\.svg is used 2 times/,
  );
  assertFails(
    lintAfter((root) => write(root, planFile('diagrams/spare.svg'), '<svg/>\n')),
    /diagrams\/spare\.svg is used 0 times/,
  );
});

test('raw HTML: only pill spans, and list tags inside table rows', () => {
  assertFails(
    lintAfter(appendTo('01-flow.md', '\nSome <b>bold</b> text.\n')),
    /01-flow\.md:\d+: raw HTML <b> is not allowed/,
  );
  assertFails(
    lintAfter(appendTo('01-flow.md', '\n<ul><li>x</li></ul>\n')),
    /raw HTML <ul> is not allowed/,
  );
  assertFails(
    lintAfter(appendTo('01-flow.md', '\n<span class="pill t-new">x</span>\n')),
    /raw HTML <span/,
  );
  assert.deepEqual(
    lintAfter(appendTo('01-flow.md', '\nCode `<b>` and <https://example.com> are fine.\n')).errors,
    [],
  );
});

test('items: a test criterion needs at least six words', () => {
  assertFails(
    lintAfter(
      replaceIn(
        '02-milestones.md',
        '(a) a test plays a recorded book end to end.',
        '(a) a test plays.',
      ),
    ),
    /02-milestones\.md:\d+: test criterion \(a\) needs at least 6 words/,
  );
});

test('items: ids are unique', () => {
  assertFails(
    lintAfter(replaceIn('02-milestones.md', '[M0.bb]', '[M0.aa]')),
    /M0\.aa is used twice/,
  );
});

test('items: criteria run from (a) in order', () => {
  assertFails(
    lintAfter(
      replaceIn(
        '02-milestones.md',
        '; (b) a test asserts the second thing',
        '; (c) a test asserts the second thing',
      ),
    ),
    /found \(c\) where \(b\) belongs/,
  );
});

test('items: items and milestone headings live only in the milestones section', () => {
  assertFails(
    lintAfter(
      appendTo(
        '01-flow.md',
        '\n- **[M0.zz]** Stray.\n  _Done when:_ (a) a test does the stray thing well.\n',
      ),
    ),
    /01-flow\.md:\d+: items and milestone headings belong only/,
  );
});

test('items: M0 to M5 each end with one exit, and M6 has none', () => {
  assertFails(
    lintAfter(
      replaceIn(
        '02-milestones.md',
        "**[M1.exit] Done when** you listen for a week.\n_Done when:_ (a) Sofia's sign-off.\n",
        '',
      ),
    ),
    /M1 has no exit/,
  );
  assertFails(
    lintAfter(
      appendTo(
        '02-milestones.md',
        "\n**[M6.exit] Done when** later.\n_Done when:_ (a) Sofia's sign-off.\n",
      ),
    ),
    /M6 has no exit/,
  );
});

test('orphan tags: a test tag must name an existing item and test criterion', () => {
  const good = `test('${tag('M0.aa', 'b')} the second thing', () => {});\n`;
  assert.deepEqual(lintAfter((root) => write(root, 'web/src/a.test.ts', good)).errors, []);
  assertFails(
    lintAfter((root) =>
      write(root, 'web/src/a.test.ts', `it('${tag('M0.zz', 'a')} x', () => {});\n`),
    ),
    /web\/src\/a\.test\.ts:1: .*M0\.zz.*no such item/,
  );
  assertFails(
    lintAfter((root) =>
      write(root, 'server/src/b.spec.ts', `it('${tag('M0.dd', 'b')} x', () => {});\n`),
    ),
    /b\.spec\.ts:1: .*M0\.dd\/b.*not a test criterion/,
  );
  const kotlin = 'class FooTest {\n  @Test fun `' + 'M0_aa' + '_c_third thing`() {}\n}\n';
  assertFails(
    lintAfter((root) => write(root, 'android/app/src/test/kotlin/FooTest.kt', kotlin)),
    /FooTest\.kt:2: .*M0\.aa\/c/,
  );
});

test('orphan tags: node_modules and the committed test fixtures are not scanned', () => {
  const stray = `it('${tag('M0.zz', 'a')} x', () => {});\n`;
  const result = lintAfter((root) => {
    write(root, 'node_modules/pkg/a.test.js', stray);
    write(root, 'scripts/plan/test-fixtures/a.test.mjs', stray);
  });
  assert.deepEqual(result.errors, []);
});

test(`size: the plan stays within ${WORD_LIMIT} words`, () => {
  const long = `\n${'word '.repeat(WORD_LIMIT)}\n`;
  assertFails(
    lintAfter(appendTo('01-flow.md', long)),
    /docs\/plan: \d+ words, over the 18000-word limit/,
  );
});

test('no dated notes: dates and history phrases fail', () => {
  assertFails(
    lintAfter(appendTo('01-flow.md', '\nChecked live 2026-09-27.\n')),
    /01-flow\.md:\d+: dated note "2026-09-27"/,
  );
  assertFails(
    lintAfter(appendTo('01-flow.md', '\nChecked on September 27, 2026.\n')),
    /dated note "September 27, 2026"/,
  );
  assertFails(
    lintAfter(appendTo('01-flow.md', '\nChecked 27 Sep 2026.\n')),
    /dated note "27 Sep 2026"/,
  );
  assertFails(
    lintAfter(appendTo('01-flow.md', '\nThis previously said otherwise.\n')),
    /dated note "previously"/,
  );
  assertFails(
    lintAfter(appendTo('01-flow.md', '\nThe queue (new) works.\n')),
    /dated note "\(new\)"/,
  );
});

test('no dated notes: a date split across two lines of one paragraph still fails', () => {
  assertFails(
    lintAfter(appendTo('01-flow.md', '\nThis changed on September 3,\n2026 for good.\n')),
    /dated note "September 3, 2026"/,
  );
  assertFails(
    lintAfter(appendTo('01-flow.md', '\nThe queue was changed\nto a list.\n')),
    /dated note "was changed to"/,
  );
});

test('no dated notes: a blank line or a new list item ends the paragraph', () => {
  const ok =
    '\nThe plan covers September 3,\n\n2026 is a year.\n\n- Step September 3,\n- 2026 again.\n';
  assert.deepEqual(lintAfter(appendTo('01-flow.md', ok)).errors, []);
});

test('no dated notes: "previously" after an article describes a thing, not history', () => {
  const ok = '\nBack returns to the previously played item.\n';
  assert.deepEqual(lintAfter(appendTo('01-flow.md', ok)).errors, []);
  assertFails(
    lintAfter(appendTo('01-flow.md', '\nThe queue previously played it.\n')),
    /dated note "previously"/,
  );
});

test('no dated notes: code spans, quotes and commit citations are exempt', () => {
  const ok = [
    '',
    'The notes live in `~/notes-2026-09-27.md`.',
    'She said "as of today, it works".',
    'She said “previously it failed”.',
    'Based on `781efd4` (2026-08-21, the latest commit).',
    '',
    'She said "it changed on September 3,',
    '2026, and stayed".',
    '',
  ].join('\n');
  assert.deepEqual(lintAfter(appendTo('01-flow.md', ok)).errors, []);
});

test('outbox: each item has a title, a kind and a default near the top', () => {
  const bad = (text) => lintAfter((root) => writeFileSync(join(root, 'docs/outbox/bad.md'), text));
  assertFails(bad('kind: name\ndefault: x\n'), /docs\/outbox\/bad\.md:1: .*`# ` title/);
  assertFails(bad('# A name\n\nkind: colour\ndefault: x\n'), /docs\/outbox\/bad\.md:1: .*kind:/);
  assertFails(bad('# A name\n\nkind: name\n'), /docs\/outbox\/bad\.md:1: .*default:/);
  assert.deepEqual(bad('# A name\n\nkind: name\ndefault: Auralis\n').errors, []);
});

test('[M0.plan/f] standing rules: the plan fails without its standing-rules subsection', () => {
  const heading = '### Standing rules for subagents';
  assertFails(
    lintAfter(replaceIn('01-flow.md', heading, '### Rules')),
    /docs\/plan: no "### Standing rules for subagents" subsection/,
  );
  assertFails(
    lintAfter(replaceIn('01-flow.md', /### Standing rules for subagents[\s\S]*$/, `${heading}\n`)),
    /docs\/plan: the "### Standing rules for subagents" subsection is empty/,
  );
});
