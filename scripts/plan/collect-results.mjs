/**
 * CI step: turns a job's JUnit XML into plan-results.json, holding its plan-tagged tests only.
 *
 *   node scripts/plan/collect-results.mjs --workflow ci --job unit --out reports/plan-results.json reports/junit/*.xml
 *
 * The commit is $GITHUB_SHA, or HEAD outside Actions. A missing XML file is skipped, so a job
 * that died before writing one still uploads what it has.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { collectResults, defaultExec, git } from './results.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { workflow: { type: 'string' }, job: { type: 'string' }, out: { type: 'string' } },
});
if (!values.workflow || !values.job || !values.out) {
  console.error('usage: collect-results.mjs --workflow <wf> --job <job> --out <file> <junit.xml>…');
  process.exit(2);
}

const commit = process.env.GITHUB_SHA || git(defaultExec, process.cwd(), 'rev-parse', 'HEAD');
const files = positionals.filter((f) => {
  if (existsSync(f)) return true;
  console.warn(`collect-results: ${f} does not exist; skipped`);
  return false;
});
const results = collectResults({
  workflow: values.workflow,
  job: values.job,
  commit,
  xmls: files.map((f) => readFileSync(f, 'utf8')),
});
mkdirSync(dirname(values.out), { recursive: true });
writeFileSync(values.out, `${JSON.stringify(results, null, 2)}\n`);
console.log(
  `collect-results: ${results.tests.length} tagged test(s) from ${files.length} file(s) → ${values.out}`,
);
