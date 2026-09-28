/**
 * The subagent brief: the plan's standing rules verbatim, then the item and its done-when.
 * Run: node --test scripts/plan/brief.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { readPlan, STANDING_RULES_HEADING, standingRules } from './parse.mjs';
import { REPO_ROOT } from './testing.mjs';

const BRIEF = join(REPO_ROOT, 'scripts', 'plan', 'brief.mjs');
const brief = (...args) =>
  spawnSync(process.execPath, [BRIEF, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });

const realRules = () => {
  const errors = [];
  const rules = standingRules(readPlan(join(REPO_ROOT, 'docs', 'plan'), errors));
  assert.deepEqual(errors, []);
  return rules;
};

test('[M0.plan/f] the plan has a standing-rules section for subagents, as a list', () => {
  const rules = realRules();
  assert.ok(rules, `docs/plan has no "${STANDING_RULES_HEADING}" subsection`);
  assert.ok(rules.startsWith(`${STANDING_RULES_HEADING}\n`));
  assert.ok(rules.split('\n').filter((l) => l.startsWith('- ')).length >= 5, rules);
});

test('[M0.plan/f] the subagent brief begins with the standing-rules section, verbatim', () => {
  const run = brief('M0.plan');
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stdout.startsWith(`${realRules()}\n`), run.stdout.slice(0, 400));
});

test('[M0.plan/f] the brief then gives the item line, its done-when and an empty task heading', () => {
  const run = brief('M0.plan');
  assert.equal(run.status, 0, run.stderr);
  const rest = run.stdout.slice(realRules().length);
  assert.match(rest, /^- \*\*\[M0\.plan\]\*\* This plan moved into/m);
  assert.match(rest, /^ {2}_Done when:_ \(a\) /m);
  assert.match(rest, /\n## Task\n*$/);
});

test('[M0.plan/f] the brief for an exit gives its exit line and done-when', () => {
  const run = brief('M0.exit');
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^\*\*\[M0\.exit\] Done when\*\* /m);
  assert.match(run.stdout, /^_Done when:_ \(a\) Sofia's sign-off/m);
});

test('[M0.plan/f] the brief for an unknown item id fails with a message', () => {
  const run = brief('M9.nothing');
  assert.notEqual(run.status, 0);
  assert.equal(run.stdout, '');
  assert.match(run.stderr, /M9\.nothing is no item in docs\/plan/);
});

test('[M0.plan/f] the brief without an item id fails with its usage', () => {
  const run = brief();
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /usage: node scripts\/plan\/brief\.mjs <item id>/);
});
