/**
 * The plan parser: `docs/plan` Markdown in, header, sections and milestones out.
 * Run: node --test scripts/plan/parse.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPlan, parseDirectives, PlanParseError } from './parse.mjs';
import { edit, fixtureTree, removeTree } from './testing.mjs';

const withFixture = (fn) => {
  const root = fixtureTree();
  try {
    return fn(root, join(root, 'docs', 'plan'));
  } finally {
    removeTree(root);
  }
};

test('the header gives the page title, eyebrow, brand, h1 and intro', () =>
  withFixture((_root, dir) => {
    const { header } = loadPlan(dir);
    assert.equal(header.title, 'Fixture plan');
    assert.equal(header.eyebrow, 'Fixture · from scratch');
    assert.equal(header.brand, 'Fixture');
    assert.equal(header.brandSub, 'Test plan');
    assert.equal(header.h1, 'A plan the tests render');
    assert.match(header.intro, /^Based on `patakihara\/curly-spoon`/);
  }));

test('sections come back in file order with their front matter, number and h2', () =>
  withFixture((_root, dir) => {
    const { sections } = loadPlan(dir);
    assert.deepEqual(
      sections.map((s) => [s.file, s.id, s.nav, s.part, s.number, s.title]),
      [
        ['00-intro.md', 'intro', 'The short version', 'Why and what', 0, 'The short version'],
        ['01-flow.md', 'flow', 'Flow & tables', "How it's built", 1, 'Flow & tables'],
        ['02-milestones.md', 'milestones', 'Milestones', 'Delivery', 2, 'Milestones'],
      ],
    );
    assert.match(sections[0].markdown, /^\n?::: hero/);
    assert.doesNotMatch(sections[0].markdown, /^## /m);
  }));

test('milestones M0 to M6 come back in order, each with its items and exit last', () =>
  withFixture((_root, dir) => {
    const { milestones } = loadPlan(dir);
    assert.deepEqual(
      milestones.map((m) => m.id),
      ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6'],
    );
    assert.equal(milestones[0].title, 'Foundations');
    assert.deepEqual(
      milestones[0].items.map((i) => [i.id, i.isExit]),
      [
        ['M0.aa', false],
        ['M0.bb', false],
        ['M0.cc', false],
        ['M0.dd', false],
        ['M0.exit', true],
      ],
    );
    assert.equal(milestones[6].items.at(-1).isExit, false);
  }));

test('an item carries its text, done-when, criteria, file and line', () =>
  withFixture((_root, dir) => {
    const item = loadPlan(dir).milestones[0].items[0];
    assert.equal(item.text, 'The first item, with **bold** words.');
    assert.match(item.doneWhen, /^\(a\) a test asserts the first thing/);
    assert.equal(item.file, '02-milestones.md');
    assert.equal(item.line, 12);
    assert.deepEqual(item.criteria, [
      { label: 'a', text: 'a test asserts the first thing works end to end', kind: 'test' },
      { label: 'b', text: 'a test asserts the second thing works end to end', kind: 'test' },
    ]);
  }));

test("a criterion that begins with Sofia's sign-off is a sign-off criterion", () =>
  withFixture((_root, dir) => {
    const [, , , dd, exit] = loadPlan(dir).milestones[0].items;
    assert.deepEqual(
      dd.criteria.map((c) => c.kind),
      ['test', 'signoff'],
    );
    assert.equal(exit.text, 'you sign in and it works.');
    assert.deepEqual(exit.criteria, [{ label: 'a', text: "Sofia's sign-off", kind: 'signoff' }]);
  }));

test('the milestones section keeps its intro apart from the milestone blocks', () =>
  withFixture((_root, dir) => {
    const section = loadPlan(dir).sections[2];
    assert.equal(section.intro.trim(), 'Each milestone is a slice that runs end to end.');
  }));

test('a folder with only a README is an empty plan, not an error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plan-empty-'));
  writeFileSync(join(dir, 'README.md'), '# docs/plan\n');
  const plan = loadPlan(dir);
  assert.equal(plan.empty, true);
  assert.equal(plan.header, null);
  assert.deepEqual(plan.sections, []);
  assert.deepEqual(plan.milestones, []);
  removeTree(dir);
});

test('an item without a done-when throws PlanParseError naming file and line', () =>
  withFixture((root, dir) => {
    edit(root, 'docs/plan/02-milestones.md', (t) =>
      t.replace('  _Done when:_ (a) a test asserts the second item works end to end.\n', ''),
    );
    assert.throws(
      () => loadPlan(dir),
      (err) =>
        err instanceof PlanParseError &&
        /^docs\/plan\/02-milestones\.md:14: .*M0\.bb.*done-when/.test(err.message),
    );
  }));

test('directives nest into a tree of Markdown runs and blocks', () => {
  const errors = [];
  const tree = parseDirectives(
    ['intro', '::: grid g2', '::: card', '#### A', ':::', ':::', '::: diagram flow', 'after'],
    'x.md',
    1,
    errors,
  );
  assert.deepEqual(errors, []);
  assert.equal(tree.children[0].type, 'md');
  const grid = tree.children[1];
  assert.deepEqual([grid.type, grid.name], ['directive', 'grid g2']);
  assert.equal(grid.children[0].name, 'card');
  assert.deepEqual(tree.children[2], {
    type: 'directive',
    name: 'diagram',
    arg: 'flow',
    line: 7,
    children: [],
  });
  assert.deepEqual(tree.children[3], { type: 'md', lines: ['after'] });
});

test('directive lines inside a fenced code block are plain text', () => {
  const errors = [];
  const tree = parseDirectives(['```', '::: nonsense', '```'], 'x.md', 1, errors);
  assert.deepEqual(errors, []);
  assert.equal(tree.children.length, 1);
});
