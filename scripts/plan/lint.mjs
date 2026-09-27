/**
 * The plan checks: structure, directives, raw HTML, item grammar, orphan test tags, size,
 * no dated notes, and the outbox format. `pnpm test` runs them through lint.test.mjs.
 *
 * CLI: node scripts/plan/lint.mjs   (prints errors and the word count; exit 1 on errors)
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { markdownLines, parseDirectives, readPlan, wordCount } from './parse.mjs';

export const WORD_LIMIT = 18000;

const PLAN = 'docs/plan';
const at = (file, line, message) => `${file}:${line}: ${message}`;

const PILL = /^<span class="pill t-(lib|prog|req|err)">$/;
const TABLE_LIST_TAG = /^<\/?(ul|li)>$/;
const HTML_TAG = /<\/?[a-zA-Z][a-zA-Z0-9]*(?=[\s/>])[^>]*>/g;

const MONTH =
  'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
// "The previously played item" describes a thing; only a bare "previously" dates a note.
const DATED = [
  /\b(?:19|20)\d\d-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?\b/g,
  new RegExp(`\\b(?:${MONTH})\\.? \\d{1,2}(?:st|nd|rd|th)?,? \\d{4}\\b`, 'g'),
  new RegExp(`\\b\\d{1,2} (?:${MONTH}) \\d{4}\\b`, 'g'),
  /\b(?:(?<!\b(?:the|a|an|any|each|every|its|your|their|our) )previously|formerly|used to|as of|a previous version|an earlier version|earlier draft|changelog|was changed to)\b/gi,
  /\b(?:update|updated|edit):/gi,
  /\((?:new|updated)\)/gi,
  /\bNEW:/g,
];
const COMMIT_CITATION = /`[0-9a-f]{7,40}` \(\d{4}-\d\d-\d\d/g;
const CODE_SPAN = /(`+)[\s\S]*?\1/g;
const QUOTED = /"[^"]*"|“[^”]*”/g;

const JS_TAG = /\[(M[0-6]\.[a-z][a-z0-9]{1,15})\/([a-f])\]/g;
const KT_TAG = /fun\s+`?(M[0-6])_([a-z][a-z0-9]{1,15})_([a-f])(?=[_\s`(]|$)/g;
const JS_TEST_FILE = /\.(test|spec)\.(ts|tsx|js|mjs)$/;
const KT_TEST_FILE = /^android\/.+\/src\/(test|testDebug|androidTest)\/.+\.kt$/;
const SKIP_DIRS = new Set(['node_modules', 'build', '.git', '.cache', 'dist', 'coverage']);
const SKIP_PATHS = new Set([
  '.claude/worktrees',
  'scripts/plan/fixtures',
  'scripts/plan/test-fixtures',
]);

const OUTBOX_KIND = /^kind: (product call|name|published|irreversible|physical)$/;
const OUTBOX_DEFAULT = /^default: \S.*$/;

/** Words of a plan file's body: front matter already stripped; directive lines and tags dropped. */
function countWords(lines) {
  return lines
    .filter((l) => !l.startsWith(':::'))
    .map((l) => l.replace(HTML_TAG, ' '))
    .reduce((n, l) => n + wordCount(l), 0);
}

function checkRawHtml(lines, bodyLine, file, errors) {
  for (const { text, index, fenced } of markdownLines(lines)) {
    if (fenced) continue;
    const stripped = text.replace(/\\</g, '').replace(CODE_SPAN, '');
    for (const [tagText] of stripped.matchAll(HTML_TAG)) {
      if (PILL.test(tagText) || tagText === '</span>') continue;
      if (TABLE_LIST_TAG.test(tagText) && text.startsWith('|')) continue;
      errors.push(at(file, bodyLine + index, `raw HTML ${tagText} is not allowed`));
    }
  }
}

function checkDatedNotes(lines, bodyLine, file, errors) {
  for (const { text, index, fenced } of markdownLines(lines)) {
    if (fenced) continue;
    const stripped = text
      .replace(COMMIT_CITATION, ' ')
      .replace(CODE_SPAN, ' ')
      .replace(QUOTED, ' ');
    for (const pattern of DATED) {
      for (const [match] of stripped.matchAll(pattern)) {
        errors.push(
          at(file, bodyLine + index, `dated note "${match}"; state the fact, not its history`),
        );
      }
    }
  }
}

function checkDirectives(plan, dir, errors) {
  const uses = new Map();
  for (const section of plan.sections) {
    const file = `${PLAN}/${section.file}`;
    const walk = (node) => {
      for (const child of node.children) {
        if (child.type !== 'directive') continue;
        if (child.name === 'diagram') {
          uses.set(child.arg, (uses.get(child.arg) ?? 0) + 1);
          if (!existsSync(join(dir, 'diagrams', `${child.arg}.svg`))) {
            errors.push(at(file, child.line, `diagrams/${child.arg}.svg does not exist`));
          }
        }
        walk(child);
      }
    };
    walk(parseDirectives(section.lines, file, section.bodyLine, errors));
  }
  const diagrams = existsSync(join(dir, 'diagrams')) ? readdirSync(join(dir, 'diagrams')) : [];
  for (const name of diagrams.filter((f) => f.endsWith('.svg'))) {
    const n = uses.get(name.slice(0, -4)) ?? 0;
    if (n !== 1)
      errors.push(
        at(
          `${PLAN}/diagrams/${name}`,
          0,
          `diagrams/${name} is used ${n} times; every diagram is used exactly once`,
        ),
      );
  }
}

function* testSources(root, dir = root) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const rel = relative(root, path).split('\\').join('/');
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || SKIP_PATHS.has(rel)) continue;
      yield* testSources(root, path);
    } else if (JS_TEST_FILE.test(entry.name) || KT_TEST_FILE.test(rel)) {
      yield rel;
    }
  }
}

function checkOrphanTags(root, plan, errors) {
  const criteria = new Map();
  for (const m of plan.milestones) {
    for (const item of m.items) criteria.set(item.id, item.criteria);
  }
  for (const rel of testSources(root)) {
    const lines = readFileSync(join(root, rel), 'utf8').split('\n');
    const pattern = rel.endsWith('.kt') ? KT_TAG : JS_TAG;
    for (const [index, text] of lines.entries()) {
      for (const m of text.matchAll(pattern)) {
        const [item, letter] = rel.endsWith('.kt') ? [`${m[1]}.${m[2]}`, m[3]] : [m[1], m[2]];
        const shown = `${item}/${letter}`;
        const list = criteria.get(item);
        if (!list) {
          errors.push(at(rel, index + 1, `tag ${shown}: ${item} is no such item in ${PLAN}`));
          continue;
        }
        const criterion = list.find((c) => c.label === letter);
        if (!criterion || criterion.kind !== 'test') {
          errors.push(
            at(rel, index + 1, `tag ${shown}: (${letter}) is not a test criterion of ${item}`),
          );
        }
      }
    }
  }
}

function checkOutbox(root, errors) {
  const dir = join(root, 'docs', 'outbox');
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .sort()) {
    const file = `docs/outbox/${name}`;
    const lines = readFileSync(join(dir, name), 'utf8').split('\n');
    if (!/^# \S/.test(lines[0] ?? '')) errors.push(at(file, 1, 'the first line is a `# ` title'));
    const head = lines.slice(0, 6);
    if (!head.some((l) => OUTBOX_KIND.test(l))) {
      errors.push(
        at(
          file,
          1,
          'within the first 6 lines: `kind: product call|name|published|irreversible|physical`',
        ),
      );
    }
    if (!head.some((l) => OUTBOX_DEFAULT.test(l))) {
      errors.push(
        at(file, 1, 'within the first 6 lines: `default: <what happens without an answer>`'),
      );
    }
  }
}

/** Runs every check on the repo at `root`. Returns `{ errors, words, notices }`. */
export function lintPlan(root) {
  const errors = [];
  const notices = [];
  const dir = join(root, PLAN);
  const plan = readPlan(dir, errors);
  let words = 0;
  if (plan.empty) {
    notices.push(
      `no sections yet: ${PLAN} holds no _header.md or section files, so only the outbox is checked`,
    );
  } else {
    const files = [
      ...(plan.header
        ? [{ file: `${PLAN}/_header.md`, lines: plan.header.body, bodyLine: plan.header.bodyLine }]
        : []),
      ...plan.sections.map((s) => ({
        file: `${PLAN}/${s.file}`,
        lines: [`## ${s.title}`, ...s.lines],
        bodyLine: s.bodyLine - 1,
      })),
    ];
    for (const { file, lines, bodyLine } of files) {
      checkRawHtml(lines, bodyLine, file, errors);
      checkDatedNotes(lines, bodyLine, file, errors);
      words += countWords(lines);
    }
    checkDirectives(plan, dir, errors);
    checkOrphanTags(root, plan, errors);
    if (words > WORD_LIMIT)
      errors.push(`${PLAN}: ${words} words, over the ${WORD_LIMIT}-word limit`);
  }
  checkOutbox(root, errors);
  return { errors, words, notices };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
  const { errors, words, notices } = lintPlan(root);
  for (const n of notices) console.log(`notice: ${n}`);
  for (const e of errors) console.log(e);
  console.log(`${PLAN}: ${words} words (limit ${WORD_LIMIT}), ${errors.length} error(s)`);
  process.exit(errors.length ? 1 : 0);
}
