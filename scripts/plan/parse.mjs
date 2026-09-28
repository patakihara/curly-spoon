/**
 * Reads `docs/plan` into a plain object: the header, the sections in page order, and the
 * milestones with their items and done-when criteria. The grammar lives in docs/plan/README.md.
 *
 * `loadPlan` is pure (it only reads the folder) and throws `PlanParseError` on the first
 * grammar error. `readPlan` collects every error instead, for the lint.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export class PlanParseError extends Error {
  constructor(message, errors = [message]) {
    super(message);
    this.name = 'PlanParseError';
    this.errors = errors;
  }
}

export const HEADER_KEYS = ['title', 'eyebrow', 'brand', 'brand-sub'];
export const SECTION_KEYS = ['id', 'nav', 'part'];
export const SECTION_FILE = /^(\d\d)-([a-z]+)\.md$/;
export const MILESTONES_ID = 'milestones';
export const MILESTONE_IDS = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6'];
export const EXIT_MILESTONES = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5'];

export const MILESTONE_HEADING = /^### (M[0-6]) · (.+)$/;
export const ITEM_LINE = /^- \*\*\[(M[0-6])\.([a-z][a-z0-9]{1,15})\]\*\* (.+)$/;
export const ITEM_DONE_WHEN = /^ {2}_Done when:_ (.+)$/;
export const EXIT_LINE = /^\*\*\[(M[0-6])\.exit\] Done when\*\* (.+)$/;
export const EXIT_DONE_WHEN = /^_Done when:_ (.+)$/;
/** Lines that look like milestone grammar, for "only in the milestones file" and typo checks. */
export const MILESTONE_LIKE = /^(### M\d|- \*\*\[M\d|\*\*\[M\d)/;

const SIGNOFF = /^Sofia['’]s sign-off/;
const FENCE = /^\s*(```|~~~)/;

export const DIRECTIVE_OPEN =
  /^::: (hero|grid g2|grid g3|card|callout warn|callout|lede|cap|small muted|small)$/;
export const DIRECTIVE_DIAGRAM = /^::: diagram ([a-z0-9-]+)$/;
const DIRECTIVE_CLOSE = /^:::$/;

const at = (file, line, message) => `${file}:${line}: ${message}`;

export const wordCount = (text) => (text.match(/\S+/g) ?? []).length;

/** Yields `{ text, index, fenced }` per line, `fenced` true inside (and on) a code fence. */
export function* markdownLines(lines) {
  let fenced = false;
  for (const [index, text] of lines.entries()) {
    if (FENCE.test(text)) {
      yield { text, index, fenced: true };
      fenced = !fenced;
      continue;
    }
    yield { text, index, fenced };
  }
}

/**
 * Splits `---`-delimited front matter from the body. Returns `{ keys, data, body, bodyLine }`,
 * where `body[i]` is line `bodyLine + i` of the file.
 */
export function parseFrontMatter(text, file, errors) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines[0] !== '---') {
    errors.push(at(file, 1, 'the file must open with front matter (`---`)'));
    return { keys: [], data: {}, body: lines, bodyLine: 1 };
  }
  const end = lines.indexOf('---', 1);
  if (end === -1) {
    errors.push(at(file, 1, 'the front matter is never closed with `---`'));
    return { keys: [], data: {}, body: [], bodyLine: lines.length + 1 };
  }
  const keys = [];
  const data = {};
  for (let i = 1; i < end; i++) {
    const m = /^([a-z-]+): (.+)$/.exec(lines[i]);
    if (!m) {
      errors.push(at(file, i + 1, `front matter lines are \`key: value\`, not "${lines[i]}"`));
      continue;
    }
    keys.push(m[1]);
    data[m[1]] = m[2];
  }
  return { keys, data, body: lines.slice(end + 1), bodyLine: end + 2 };
}

function checkKeys(keys, expected, file, errors) {
  if (keys.join() !== expected.join()) {
    errors.push(
      at(file, 1, `the front matter must hold exactly ${expected.join(', ')}, in that order`),
    );
  }
}

/**
 * Splits a done-when into criteria: `(a) text; (b) text.`. Letters run from (a), 1 to 6 of
 * them, at most one sign-off, and each test criterion is at least 6 words.
 */
export function parseCriteria(doneWhen, file, line, errors) {
  const parts = doneWhen.replace(/\.\s*$/, '').split(/; (?=\([a-z]\) )/);
  const criteria = [];
  for (const [i, part] of parts.entries()) {
    const expected = String.fromCharCode(97 + i);
    const m = /^\(([a-z])\) (.+)$/.exec(part);
    if (!m) {
      errors.push(at(file, line, `criterion ${i + 1} must start "(${expected}) "`));
      continue;
    }
    if (m[1] !== expected) {
      errors.push(
        at(file, line, `criteria run (a), (b), …: found (${m[1]}) where (${expected}) belongs`),
      );
    }
    const kind = SIGNOFF.test(m[2]) ? 'signoff' : 'test';
    if (kind === 'test' && wordCount(m[2]) < 6) {
      errors.push(at(file, line, `test criterion (${m[1]}) needs at least 6 words: "${m[2]}"`));
    }
    criteria.push({ label: m[1], text: m[2], kind });
  }
  if (criteria.length > 6) errors.push(at(file, line, `${criteria.length} criteria; at most 6`));
  if (criteria.filter((c) => c.kind === 'signoff').length > 1) {
    errors.push(at(file, line, 'at most one sign-off criterion per item'));
  }
  return criteria;
}

/**
 * Parses the milestones section body. Returns `{ intro, milestones }`: `intro` is the Markdown
 * before the first milestone heading.
 */
export function parseMilestones(lines, bodyLine, file, errors, label = 'docs/plan') {
  const where = `${label}/${file}`;
  const milestones = [];
  const intro = [];
  const seen = new Set();
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const line = bodyLine + i;
    const heading = MILESTONE_HEADING.exec(text);
    if (heading) {
      const expected = MILESTONE_IDS[milestones.length];
      if (heading[1] !== expected) {
        errors.push(
          at(
            where,
            line,
            `milestone ${heading[1]} is out of order; ${expected ?? 'none'} belongs here`,
          ),
        );
      }
      current = { id: heading[1], title: heading[2], line, items: [], exitSeen: false };
      milestones.push(current);
      continue;
    }
    if (!current) {
      if (MILESTONE_LIKE.test(text)) {
        errors.push(at(where, line, 'milestone grammar before the first `### M0 · …` heading'));
      }
      intro.push(text);
      continue;
    }
    if (text.trim() === '') continue;
    const item = ITEM_LINE.exec(text);
    const exit = EXIT_LINE.exec(text);
    if (item || exit) {
      const [ms, slug, body] = item ? [item[1], item[2], item[3]] : [exit[1], 'exit', exit[2]];
      const id = `${ms}.${slug}`;
      if (current.exitSeen) {
        errors.push(
          at(where, line, `${id} follows ${current.id}.exit; the exit is the last block`),
        );
      }
      if (ms !== current.id) errors.push(at(where, line, `${id} sits under ${current.id}`));
      if (item && slug === 'exit')
        errors.push(at(where, line, `${id} is written as an item, not an exit`));
      if (exit && !EXIT_MILESTONES.includes(current.id)) {
        errors.push(at(where, line, `${current.id} has no exit`));
      }
      if (seen.has(id)) errors.push(at(where, line, `${id} is used twice`));
      seen.add(id);
      const doneWhen = (item ? ITEM_DONE_WHEN : EXIT_DONE_WHEN).exec(lines[i + 1] ?? '');
      if (!doneWhen) {
        const shape = item ? '`  _Done when:_ (a) …`' : '`_Done when:_ (a) …`';
        errors.push(at(where, line, `${id} has no done-when; the next line must be ${shape}`));
      } else {
        i++;
      }
      const criteria = doneWhen ? parseCriteria(doneWhen[1], where, line + 1, errors) : [];
      current.items.push({
        id,
        text: body,
        doneWhen: doneWhen?.[1] ?? '',
        criteria,
        isExit: Boolean(exit),
        file,
        line,
      });
      if (exit) current.exitSeen = true;
      continue;
    }
    if (MILESTONE_LIKE.test(text)) {
      errors.push(at(where, line, `malformed milestone line: "${text}"`));
    } else {
      errors.push(at(where, line, `only items and the exit belong under ${current.id}: "${text}"`));
    }
  }
  for (const id of MILESTONE_IDS) {
    if (!milestones.some((m) => m.id === id))
      errors.push(at(where, bodyLine, `milestone ${id} is missing`));
  }
  for (const m of milestones) {
    if (EXIT_MILESTONES.includes(m.id) && !m.exitSeen) {
      errors.push(at(where, m.line, `${m.id} has no exit (\`**[${m.id}.exit] Done when** …\`)`));
    }
  }
  return {
    intro: intro.join('\n'),
    milestones: milestones.map(({ id, title, items }) => ({ id, title, items })),
  };
}

/**
 * Builds the directive tree of one section body: `{ type: 'root', children }`, where each child
 * is `{ type: 'md', lines }` or `{ type: 'directive', name, arg, line, children }`.
 */
export function parseDirectives(lines, file, bodyLine, errors) {
  const root = { type: 'root', children: [] };
  const stack = [root];
  const top = () => stack.at(-1);
  const pushText = (text) => {
    const last = top().children.at(-1);
    if (last?.type === 'md') last.lines.push(text);
    else top().children.push({ type: 'md', lines: [text] });
  };
  for (const { text, index, fenced } of markdownLines(lines)) {
    const line = bodyLine + index;
    if (fenced || !text.startsWith(':::')) {
      pushText(text);
      continue;
    }
    const open = DIRECTIVE_OPEN.exec(text);
    const diagram = DIRECTIVE_DIAGRAM.exec(text);
    if (open) {
      const node = { type: 'directive', name: open[1], arg: null, line, children: [] };
      top().children.push(node);
      stack.push(node);
    } else if (diagram) {
      top().children.push({
        type: 'directive',
        name: 'diagram',
        arg: diagram[1],
        line,
        children: [],
      });
    } else if (DIRECTIVE_CLOSE.test(text)) {
      if (stack.length === 1) errors.push(at(file, line, '`:::` closes nothing'));
      else stack.pop();
    } else {
      errors.push(at(file, line, `unknown directive "${text}"`));
    }
  }
  for (const node of stack.slice(1)) {
    errors.push(at(file, node.line, `\`::: ${node.name}\` is never closed`));
  }
  return root;
}

function readHeader(dir, label, errors) {
  const file = `${label}/_header.md`;
  const { keys, data, body, bodyLine } = parseFrontMatter(
    readFileSync(join(dir, '_header.md'), 'utf8'),
    file,
    errors,
  );
  checkKeys(keys, HEADER_KEYS, file, errors);
  const first = body.findIndex((l) => l.trim() !== '');
  const h1 = /^# (.+)$/.exec(body[first] ?? '');
  if (!h1)
    errors.push(at(file, bodyLine + Math.max(first, 0), 'the header body starts with `# <title>`'));
  return {
    file: '_header.md',
    title: data.title,
    eyebrow: data.eyebrow,
    brand: data.brand,
    brandSub: data['brand-sub'],
    h1: h1?.[1] ?? '',
    intro: body
      .slice(first + 1)
      .join('\n')
      .trim(),
    bodyLine,
    body,
  };
}

function readSection(dir, name, label, errors) {
  const file = `${label}/${name}`;
  const [, nn, fileId] = SECTION_FILE.exec(name);
  const { keys, data, body, bodyLine } = parseFrontMatter(
    readFileSync(join(dir, name), 'utf8'),
    file,
    errors,
  );
  checkKeys(keys, SECTION_KEYS, file, errors);
  if (data.id !== fileId)
    errors.push(at(file, 2, `id "${data.id}" must match the filename's "${fileId}"`));
  const first = body.findIndex((l) => l.trim() !== '');
  const h2 = /^## (.+)$/.exec(body[first] ?? '');
  if (!h2)
    errors.push(
      at(file, bodyLine + Math.max(first, 0), 'the first content line is the `## ` heading'),
    );
  for (const { text, index, fenced } of markdownLines(body)) {
    if (fenced || index === first) continue;
    if (/^## /.test(text))
      errors.push(at(file, bodyLine + index, 'a section has exactly one `## `'));
    if (/^# /.test(text))
      errors.push(at(file, bodyLine + index, '`# ` belongs only in _header.md'));
  }
  const rest = h2 ? body.slice(first + 1) : body;
  const restLine = h2 ? bodyLine + first + 1 : bodyLine;
  return {
    file: name,
    id: data.id,
    nav: data.nav,
    part: data.part,
    number: Number(nn),
    title: h2?.[1] ?? '',
    markdown: rest.join('\n'),
    lines: rest,
    bodyLine: restLine,
  };
}

export const STANDING_RULES_HEADING = '### Standing rules for subagents';

/**
 * The standing-rules subsection of a read plan, verbatim: its heading line through the line
 * before the next `##`/`###` heading or the section's end, trailing blank lines dropped. Null
 * when no section holds the heading.
 */
export function standingRules(plan) {
  for (const section of plan.sections ?? []) {
    const lines = [...markdownLines(section.lines)];
    const start = lines.findIndex((l) => !l.fenced && l.text === STANDING_RULES_HEADING);
    if (start === -1) continue;
    const end = lines.findIndex((l, i) => i > start && !l.fenced && /^#{2,3} /.test(l.text));
    const body = section.lines.slice(start, end === -1 ? undefined : end);
    while (body.length && body.at(-1).trim() === '') body.pop();
    return body.join('\n');
  }
  return null;
}

/**
 * Reads the plan, pushing every grammar error onto `errors` (strings `file:line: message`).
 * A folder with no `_header.md` and no section files is `{ empty: true }`.
 */
export function readPlan(dir, errors, { label = 'docs/plan' } = {}) {
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.md') && f !== 'README.md')
        .sort()
    : [];
  if (files.length === 0) return { empty: true, header: null, sections: [], milestones: [] };

  const header = files.includes('_header.md')
    ? readHeader(dir, label, errors)
    : (errors.push(at(`${label}/_header.md`, 1, 'the header file is missing')), null);

  const sections = [];
  for (const name of files.filter((f) => f !== '_header.md')) {
    if (!SECTION_FILE.test(name)) {
      errors.push(at(`${label}/${name}`, 1, 'section files are named `NN-<id>.md`, id in [a-z]+'));
      continue;
    }
    const nn = Number(SECTION_FILE.exec(name)[1]);
    if (nn !== sections.length) {
      errors.push(
        at(
          `${label}/${name}`,
          1,
          `section numbers run from 00 without gaps; ${String(sections.length).padStart(2, '0')} belongs here`,
        ),
      );
    }
    const section = readSection(dir, name, label, errors);
    if (sections.some((s) => s.id === section.id)) {
      errors.push(at(`${label}/${name}`, 2, `id "${section.id}" is used twice`));
    }
    sections.push(section);
  }

  let milestones = [];
  const ms = sections.find((s) => s.id === MILESTONES_ID);
  if (!ms) errors.push(at(label, 0, `no section has id "${MILESTONES_ID}"`));
  for (const section of sections) {
    if (section === ms) continue;
    for (const { text, index, fenced } of markdownLines(section.lines)) {
      if (!fenced && MILESTONE_LIKE.test(text)) {
        errors.push(
          at(
            `${label}/${section.file}`,
            section.bodyLine + index,
            `items and milestone headings belong only in the "${MILESTONES_ID}" section`,
          ),
        );
      }
    }
  }
  if (ms) {
    const parsed = parseMilestones(ms.lines, ms.bodyLine, ms.file, errors, label);
    ms.intro = parsed.intro;
    milestones = parsed.milestones;
  }
  return { empty: false, header, sections, milestones };
}

/** Reads the plan, or throws `PlanParseError` (message `file:line: …`) on the first error. */
export function loadPlan(dir, options) {
  const errors = [];
  const plan = readPlan(dir, errors, options);
  if (errors.length) throw new PlanParseError(errors[0], errors);
  return plan;
}
