/**
 * Renders docs/plan and its computed progress into one self-contained HTML page, the published
 * plan artifact. `renderPlan` is pure given its inputs; the CLI gathers them.
 *
 * CLI: node scripts/plan/render.mjs [--out build/plan/index.html] [--results ci|local|none] [--draft] [--root <dir>]
 *
 * It refuses on any lint error, and, without --draft, on uncommitted changes to docs/plan,
 * docs/outbox or scripts/plan. It writes the page and stamp.json beside it.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Marked } from 'marked';
import { lintPlan } from './lint.mjs';
import { loadPlan, parseDirectives } from './parse.mjs';
import { computeProgress, sourcesLine } from './progress.mjs';
import { defaultExec, git } from './results.mjs';
import { SOURCES, sourcesTree } from './record-publish.mjs';

const REPO_URL = 'https://github.com/patakihara/curly-spoon';
const FONTS =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=Roboto+Flex:opsz,wght@8..144,400..900&display=swap';

// `**x**` and `_x_` render as <b> and <i>, the live page's own markup (page.css styles `.exit b`).
const marked = new Marked({
  gfm: true,
  renderer: {
    strong({ tokens }) {
      return `<b>${this.parser.parseInline(tokens)}</b>`;
    },
    em({ tokens }) {
      return `<i>${this.parser.parseInline(tokens)}</i>`;
    },
    // A body row's trailing empty cells fold into its last filled cell, as a colspan.
    table(token) {
      token.rows = token.rows.map(spanTrailingEmpty);
      return false;
    },
    tablecell(token) {
      if (!token.colspan) return false;
      const type = token.header ? 'th' : 'td';
      const align = token.align ? ` align="${token.align}"` : '';
      return `<${type}${align} colspan="${token.colspan}">${this.parser.parseInline(token.tokens)}</${type}>\n`;
    },
  },
});

function spanTrailingEmpty(row) {
  let last = row.length - 1;
  while (last > 0 && row[last].text.trim() === '') last--;
  if (last === 0 || last === row.length - 1) return row;
  return [...row.slice(0, last), { ...row[last], colspan: row.length - last }];
}
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
const attr = (s) => esc(s).replace(/"/g, '&quot;');
const inline = (s) => marked.parseInline(s);
const wrapTables = (html) =>
  html.replace(/<table>/g, '<div class="tw"><table>').replace(/<\/table>/g, '</table></div>');

/** Top-level tokens of a Markdown run, each rendered on its own. */
const blocks = (text) =>
  marked
    .lexer(text)
    .filter((t) => t.type !== 'space')
    .map((t) => ({ type: t.type, html: wrapTables(marked.parser([t])) }));

const onlyParagraph = (node) =>
  node.children.length === 1 &&
  node.children[0].type === 'md' &&
  (() => {
    const b = blocks(node.children[0].lines.join('\n'));
    return b.length === 1 && b[0].type === 'paragraph'
      ? b[0].html.trim().replace(/^<p>|<\/p>$/g, '')
      : null;
  })();

function renderNodes(children, ctx, { small = false } = {}) {
  return children.map((node) => renderNode(node, ctx, small)).join('');
}

function renderNode(node, ctx, small) {
  if (node.type === 'md') {
    return blocks(node.lines.join('\n'))
      .map((b) =>
        small && /^(list|paragraph)$/.test(b.type)
          ? b.html.replace(/^<(ul|ol|p)(?=[\s>])/, '<$1 class="small"')
          : b.html,
      )
      .join('');
  }
  const inner = () => renderNodes(node.children, ctx);
  switch (node.name) {
    case 'hero':
      return `<div class="hero">\n${inner()}</div>\n`;
    case 'grid g2':
    case 'grid g3':
      return `<div class="${node.name}">\n${inner()}</div>\n`;
    case 'card':
      return `<div class="card">${renderNodes(node.children, ctx, { small: true })}</div>\n`;
    case 'small':
      return renderNodes(node.children, ctx, { small: true });
    case 'callout':
    case 'callout warn': {
      const single = onlyParagraph(node);
      return `<div class="${node.name}">${single ?? inner()}</div>\n`;
    }
    case 'lede':
    case 'cap':
    case 'small muted': {
      const single = onlyParagraph(node);
      return single != null
        ? `<p class="${node.name}">${single}</p>\n`
        : `<div class="${node.name}">${inner()}</div>\n`;
    }
    case 'diagram':
      return `<div class="diagram">\n${ctx.diagram(node.arg)}</div>\n`;
    default:
      throw new Error(`unknown directive ${node.name}`);
  }
}

const pill = (tone, text, title) =>
  `<span class="pill ${tone}"${title ? ` title="${attr(title)}"` : ''}>${esc(text)}</span>`;

function badge(item, isNext) {
  let b = '';
  if (item.status === 'done') b = pill('t-lib', 'done');
  else if (item.status === 'failing') b = pill('t-err', 'failing');
  else if (item.inProgress)
    b = pill('t-prog', 'in progress', item.branches.map((x) => `${x.name}: ${x.note}`).join(' · '));
  else if (isNext) b = pill('t-req', 'next');
  const passed = item.criteria.filter((c) => c.status === 'passed').length;
  if (item.status !== 'done' && passed > 0)
    b += `<span class="pill">${passed}/${item.criteria.length}</span>`;
  return b;
}

const CRITERION_CLASS = { passed: 'c-pass', failed: 'c-fail' };
const criteriaHtml = (criteria) =>
  `${criteria.map((c) => `<span class="${CRITERION_CLASS[c.status] ?? 'c-open'}">(${c.label})</span> ${inline(c.text)}`).join('; ')}.`;

function renderMilestones(milestones, progress) {
  const byId = new Map(progress.milestones.flatMap((m) => m.items).map((i) => [i.id, i]));
  const fallback = (item) => ({
    status: 'open',
    inProgress: false,
    branches: [],
    criteria: item.criteria.map((c) => ({ ...c, status: 'unknown' })),
  });
  return milestones
    .map((m) => {
      const items = m.items.filter((i) => !i.isExit);
      const exit = m.items.find((i) => i.isExit);
      const state = (item) => byId.get(item.id) ?? fallback(item);
      const lis = items.map((item) => {
        const s = state(item);
        return `<li id="${attr(item.id)}"><span class="iid">${esc(item.id)}</span>${badge(s, progress.next?.id === item.id)}${inline(item.text)}<div class="dw"><b>Done when</b> ${criteriaHtml(s.criteria)}</div></li>\n`;
      });
      let exitHtml = '';
      if (exit) {
        const s = state(exit);
        const signoffOnly = s.criteria.length === 1 && s.criteria[0].kind === 'signoff';
        exitHtml =
          `<div class="exit"><b>Done when</b> ${[inline(exit.text), badge(s, progress.next?.id === exit.id)].filter(Boolean).join(' ')}</div>\n` +
          (signoffOnly
            ? `<div class="dw">Checked by Sofia's sign-off</div>\n`
            : `<div class="dw"><b>Done when</b> ${criteriaHtml(s.criteria)}</div>\n`);
      }
      return `<div class="ms"><div class="tag">${esc(m.id)}</div><div class="card">\n<h4>${inline(m.title)}</h4>\n<ul class="small">\n${lis.join('')}</ul>\n${exitHtml}</div></div>\n`;
    })
    .join('\n');
}

function renderNow(progress) {
  const waiting = progress.outbox.length
    ? `<div class="callout warn"><b>Waiting on you</b><ul>${progress.outbox
        .map(
          (o) =>
            `<li><b>${esc(o.title)}</b> <span class="pill t-req">${esc(o.kind)}</span> Default: ${inline(o.default)}</li>`,
        )
        .join(
          '',
        )}</ul>${progress.overAsking ? '<p>More than five open outbox items: sessions are over-asking.</p>' : ''}</div>`
    : '<div class="callout">Nothing is waiting on you.</div>';
  const current = progress.milestones.find((m) => m.id === progress.current);
  const link = (id) =>
    `<a href="#${attr(id.endsWith('.exit') ? 'milestones' : id)}">${esc(id)}</a>`;
  const rows = [
    `<li>Current: ${current ? `<b>${esc(current.id)} ${inline(current.title)}</b>` : progress.milestones.length ? 'every milestone done' : 'no milestones yet'}</li>`,
    `<li>${progress.milestones.map((m) => `${m.id} ${m.done}/${m.total}`).join(' · ')}</li>`,
    `<li>Next: ${progress.next ? `${link(progress.next.id)} ${inline(progress.next.text)}` : 'nothing'}</li>`,
    ...progress.inFlight.map(
      (f) => `<li>In flight: <code>${esc(f.branch)}</code> ${esc(f.note)}</li>`,
    ),
    ...progress.failing.map(
      (f) =>
        `<li>Failing: ${link(f.item)} (${f.criterion}) ${f.tests.map((t) => `<code>${esc(t)}</code>`).join(', ')}</li>`,
    ),
    `<li>Checks from ${progress.results.error ? `nowhere: ${esc(progress.results.error)}` : esc(sourcesLine(progress))}</li>`,
  ];
  const decisions =
    progress.decisions
      .map((d) => `<li><code>${d.sha.slice(0, 7)}</code> ${d.date} ${inline(d.text)}</li>`)
      .join('') || '<li>None yet.</li>';
  const ideas =
    progress.sortedIdeas
      .map(
        (s) =>
          `<li><code>${esc(s.file.replace(/^docs\/inbox\//, ''))}</code> → ${esc(s.plan ?? 'no Plan: line')}</li>`,
      )
      .join('') || '<li>None yet.</li>';
  const unsorted =
    progress.waitingIdeas
      .map((w) => `<li>${esc(w.title)} <code>${esc(w.file)}</code></li>`)
      .join('') || '<li>None.</li>';
  return [
    '<section id="now">',
    '  <h2>Now</h2>',
    `  ${waiting}`,
    '  <div class="grid g2">',
    `<div class="card"><h4>Progress</h4>\n<ul class="small">${rows.join('')}</ul></div>`,
    `<div class="card"><h4>Recent decisions</h4>\n<ul class="small">${decisions}</ul>\n<h4>Recently sorted ideas</h4>\n<ul class="small">${ideas}</ul>\n<h4>Waiting to be sorted (${progress.waitingIdeas.length})</h4>\n<ul class="small">${unsorted}</ul></div>`,
    '  </div>',
    '</section>',
  ].join('\n');
}

/** Renders the page for the repo at `root`, given its computed `progress` and the `stamp`. */
export function renderPlan({ root, progress, stamp }) {
  const dir = join(root, 'docs', 'plan');
  const plan = loadPlan(dir);
  if (plan.empty) throw new Error('docs/plan has no sections yet; nothing to render');
  const css = readFileSync(join(dir, 'page.css'), 'utf8').replace(/\n$/, '');
  const ctx = { diagram: (name) => readFileSync(join(dir, 'diagrams', `${name}.svg`), 'utf8') };
  const { header } = plan;

  const rail = [
    `<nav class="rail" aria-label="Sections">`,
    `  <div class="brand">${esc(header.brand)}</div>`,
  ];
  rail.push(`  <div class="brand-sub">${esc(header.brandSub)} · ${esc(progress.commitDate)}</div>`);
  rail.push(`  <a href="#now"><span class="n">·</span>Now</a>`);
  const body = [];
  let part = null;
  let partNo = 0;
  for (const s of plan.sections) {
    if (s.part !== part) {
      part = s.part;
      partNo++;
      rail.push(`  <div class="part">${esc(part)}</div>`);
      body.push(`<div class="part-head"><span>Part ${partNo}</span>${esc(part)}</div>\n`);
    }
    rail.push(`  <a href="#${attr(s.id)}"><span class="n">${s.number}</span>${esc(s.nav)}</a>`);
    const content =
      s.id === 'milestones'
        ? renderNodes(parseDirectives(s.intro.split('\n'), s.file, s.bodyLine, []).children, ctx) +
          renderMilestones(plan.milestones, progress)
        : renderNodes(parseDirectives(s.lines, s.file, s.bodyLine, []).children, ctx);
    body.push(
      [
        `<section id="${attr(s.id)}">`,
        ...(s.number === 0 ? [] : [`  <div class="eyebrow">${s.number}</div>`]),
        `  <h2>${inline(s.title)}</h2>`,
        content,
        '</section>\n',
      ].join('\n'),
    );
  }
  rail.push('</nav>');

  const checks = sourcesLine(progress) ?? 'unavailable';
  const footer =
    `<footer class="stamp">Rendered from patakihara/curly-spoon at <a href="${REPO_URL}/commit/${stamp.commit}"><code>${String(stamp.commit).slice(0, 7)}</code></a>` +
    ` · ${esc(progress.commitDate)} · plan tree <code>${String(stamp.tree ?? 'none').slice(0, 7)}</code> · checks from ${esc(checks || 'unavailable')}` +
    `${stamp.draft ? ' · draft, uncommitted changes' : ''}</footer>`;

  return [
    '<!doctype html>',
    '<html lang="en" data-theme="dark">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(header.title)}</title>`,
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    `<link href="${FONTS}" rel="stylesheet">`,
    '<style>',
    css,
    '</style>',
    '</head>',
    '<body>',
    '<div class="shell">',
    rail.join('\n'),
    '',
    '<main>',
    '<header>',
    `  <div class="eyebrow">${esc(header.eyebrow)}</div>`,
    `  <h1>${inline(header.h1)}</h1>`,
    `  <p class="muted">${inline(header.intro)}</p>`,
    '</header>',
    '',
    renderNow(progress),
    '',
    body.join('\n'),
    footer,
    '</main>',
    '</div>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function main() {
  const { values } = parseArgs({
    options: {
      out: { type: 'string', default: 'build/plan/index.html' },
      results: { type: 'string', default: 'ci' },
      draft: { type: 'boolean', default: false },
      root: { type: 'string' },
    },
  });
  const root = resolve(
    values.root ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
  );
  const fail = (message) => {
    console.error(`render: ${message}`);
    process.exit(1);
  };
  if (!['ci', 'local', 'none'].includes(values.results)) fail('--results is ci, local or none');
  const { errors } = lintPlan(root);
  if (errors.length) fail(`the plan has lint errors:\n${errors.join('\n')}`);
  if (!values.draft) {
    const dirty = git(
      defaultExec,
      root,
      'status',
      '--porcelain',
      '--',
      'docs/plan',
      'docs/outbox',
      'scripts/plan',
    );
    if (dirty) fail(`uncommitted changes (use --draft to render them anyway):\n${dirty}`);
  }
  const progress = computeProgress({ root, results: values.results });
  const stamp = {
    commit: progress.commit,
    tree: sourcesTree(root, SOURCES.plan),
    renderedAt: new Date().toISOString(),
    draft: values.draft,
  };
  let html;
  try {
    html = renderPlan({ root, progress, stamp });
  } catch (err) {
    fail(err.message);
  }
  const out = resolve(root, values.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  const stampPath = join(dirname(out), 'stamp.json');
  writeFileSync(stampPath, `${JSON.stringify(stamp, null, 2)}\n`);
  console.log(out);
  console.log(`${stampPath}: ${JSON.stringify(stamp)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
