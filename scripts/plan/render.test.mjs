/**
 * The renderer: docs/plan plus computed progress in, one self-contained HTML page out.
 * Run: node --test scripts/plan/render.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeProgress } from './progress.mjs';
import { SOURCES, sourcesTree } from './record-publish.mjs';
import { renderPlan } from './render.mjs';
import { edit, fakeExec, fixtureRepo, git, read, removeTree, tag, write } from './testing.mjs';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'render.mjs');
const check = (item, criterion, status) => ({
  item,
  criterion,
  name: `${tag(item, criterion)} check`,
  status,
});
const TESTS = [
  check('M0.aa', 'a', 'passed'),
  check('M0.bb', 'a', 'passed'),
  check('M0.dd', 'a', 'failed'),
];

/** Renders the fixture repo (one CI run reporting TESTS) after `change(root)`. */
function rendered(change = () => {}) {
  const { root, commits } = fixtureRepo();
  try {
    change(root);
    const runs = [
      {
        databaseId: 31,
        headSha: commits.third,
        workflowName: 'CI',
        status: 'completed',
        conclusion: 'failure',
        createdAt: '2026-01-03T00:00:00Z',
      },
    ];
    const exec = fakeExec({
      runs,
      artifacts: { 31: [{ commit: commits.third, workflow: 'ci', job: 'unit', tests: TESTS }] },
    });
    const progress = computeProgress({ root, results: 'ci', exec });
    const stamp = {
      commit: commits.head,
      tree: sourcesTree(root, SOURCES.plan),
      renderedAt: '2026-01-04T00:00:00.000Z',
      draft: false,
    };
    return { html: renderPlan({ root, progress, stamp }), commits, progress, stamp };
  } finally {
    removeTree(root);
  }
}

const itemHtml = (html, id) => {
  const start = html.indexOf(`<li id="${id}">`);
  assert.ok(start >= 0, `no <li id="${id}">`);
  return html.slice(start, html.indexOf('</li>', start) + 5);
};

test('[M0.plan/b] the page shows done, in-progress and next badges, waiting-on-you with each item body and its commands, decisions and the footer commit', () => {
  const { html, commits } = rendered();
  assert.match(
    itemHtml(html, 'M0.bb'),
    /^<li id="M0.bb"><span class="iid">M0.bb<\/span><span class="pill t-lib">done<\/span>The second item\./,
  );
  assert.match(
    itemHtml(html, 'M0.aa'),
    /<span class="pill t-prog" title="plan\/M0.aa: parser done; next: lint">in progress<\/span><span class="pill">1\/2<\/span>/,
  );
  assert.match(itemHtml(html, 'M0.cc'), /<span class="pill t-req">next<\/span>/);
  assert.match(itemHtml(html, 'M0.dd'), /<span class="pill t-err">failing<\/span>/);
  assert.match(
    html,
    /<li><b>Screenshots in the public repo\?<\/b> <span class="pill t-req">published<\/span> Default: They stay out of git\.<div class="ob"><p>Say &quot;publish them&quot; if you want them in git\. To see what is there, run:<\/p>\n<pre><code>ls docs\/screenshots\/\*\.png\n<\/code><\/pre>\n<\/div><\/li>/,
  );
  assert.match(
    html,
    new RegExp(
      `<li><code>${commits.third.slice(0, 7)}</code> \\d{4}-\\d\\d-\\d\\d Gapless is part of playback</li>`,
    ),
  );
  assert.ok(
    html.includes(
      `<a href="https://github.com/patakihara/curly-spoon/commit/${commits.head}"><code>${commits.head.slice(0, 7)}</code></a>`,
    ),
  );
});

test('[M0.plan/b] the page tells the comment auto-replier to defer to the main session, in the footer and in a comment atop the body', () => {
  const { html } = rendered();
  const note =
    'Comments on this page are answered by the main Auralis session. An automatic reply should say only: Main session will answer.';
  assert.ok(html.includes(`<body>\n<!-- ${note} -->\n`), 'the HTML comment opens the body');
  assert.match(
    html.slice(html.indexOf('<footer')),
    new RegExp(`^<footer class="stamp"><p class="small muted">${note.replace(/\./g, '\\.')}</p>`),
  );
});

test('the page is one self-contained document with the live skeleton and no scripts', () => {
  const { html } = rendered();
  assert.ok(
    html.startsWith(
      '<!doctype html>\n<html lang="en" data-theme="dark">\n<head>\n<meta charset="utf-8">',
    ),
  );
  assert.match(html, /<title>Fixture plan<\/title>/);
  assert.match(
    html,
    /<link href="https:\/\/fonts\.googleapis\.com\/css2\?family=Inter[^"]*" rel="stylesheet">/,
  );
  assert.match(html, /<style>\n\/\* Sonora tokens/);
  assert.match(html, /footer\.stamp\{/);
  assert.doesNotMatch(html, /<script/);
  assert.doesNotMatch(html.slice(html.indexOf('<body>')), / style="/);
});

test('the rail has the brand, the commit date, a Now link, and numbered links per part', () => {
  const { html, progress } = rendered();
  const rail = html.slice(html.indexOf('<nav class="rail"'), html.indexOf('</nav>'));
  assert.match(rail, /<div class="brand">Fixture<\/div>/);
  assert.ok(rail.includes(`<div class="brand-sub">Test plan · ${progress.commitDate}</div>`));
  assert.match(
    rail,
    /<a href="#now"><span class="n">·<\/span>Now<\/a>\n {2}<div class="part">Why and what<\/div>\n {2}<a href="#intro"><span class="n">0<\/span>The short version<\/a>/,
  );
  assert.match(
    rail,
    /<div class="part">How it's built<\/div>\n {2}<a href="#flow"><span class="n">1<\/span>Flow &amp; tables<\/a>/,
  );
});

test('the header, part heads and section eyebrows come from the source', () => {
  const { html } = rendered();
  assert.match(
    html,
    /<header>\n {2}<div class="eyebrow">Fixture · from scratch<\/div>\n {2}<h1>A plan the tests render<\/h1>\n {2}<p class="muted">Based on <code>patakihara\/curly-spoon<\/code>/,
  );
  assert.match(
    html,
    /<div class="part-head"><span>Part 1<\/span>Why and what<\/div>\n\n<section id="intro">\n {2}<h2>The short version<\/h2>/,
  );
  assert.match(
    html,
    /<section id="flow">\n {2}<div class="eyebrow">1<\/div>\n {2}<h2>Flow &amp; tables<\/h2>/,
  );
  assert.match(html, /<div class="part-head"><span>Part 3<\/span>Delivery<\/div>/);
  assert.ok(html.indexOf('<section id="now">') < html.indexOf('<div class="part-head">'));
});

test('directives render as the live layout blocks', () => {
  const { html } = rendered();
  assert.match(html, /<div class="hero">\n<ol>\n<li><b>Start small\.<\/b> One thing first\.<\/li>/);
  assert.match(
    html,
    /<div class="grid g2">\n<div class="card"><h4>Carried<\/h4>\n<ul class="small">\n<li>Session code <span class="pill t-lib">Carry over<\/span><\/li>/,
  );
  assert.match(html, /<div class="card"><h4>Plain<\/h4>\n<p class="small">A card paragraph\.<\/p>/);
  assert.match(html, /<div class="callout">A single paragraph callout with <b>bold<\/b>\.<\/div>/);
  assert.match(
    html,
    /<div class="callout warn"><p><b>Still open:<\/b> one thing\.<\/p>\n<p>A second paragraph\.<\/p>\n<\/div>/,
  );
  assert.match(html, /<p class="lede">Everything flows\.<\/p>/);
  assert.match(
    html,
    /<div class="diagram">\n<svg viewBox="0 0 10 10" role="img" aria-label="Flow"><path d="M0,0 L10,10"\/><\/svg>\n<\/div>/,
  );
});

test('tables are wrapped for scrolling, and a table cell may hold a list', () => {
  const { html } = rendered();
  assert.match(html, /<div class="tw"><table>\n<thead>/);
  assert.match(
    html,
    /<td><code>a \| b<\/code><\/td>\n<td><ul><li>one<\/li><li>two<\/li><\/ul><\/td>/,
  );
  assert.match(html, /<\/table>\n?<\/div>/);
});

test('a row whose trailing cells are empty spans its last filled cell over them', () => {
  const table = [
    '',
    '| Job | A | B | C |',
    '|---|---|---|---|',
    '| Anywhere | all three |  |  |',
    '| Middle |  | only B |  |',
    '| Full | a | b | c |',
    '',
  ].join('\n');
  const { html } = rendered((root) => edit(root, 'docs/plan/01-flow.md', (t) => t + table));
  assert.match(html, /<tr>\n<td>Anywhere<\/td>\n<td colspan="3">all three<\/td>\n<\/tr>/);
  assert.match(html, /<tr>\n<td>Middle<\/td>\n<td><\/td>\n<td colspan="2">only B<\/td>\n<\/tr>/);
  assert.match(html, /<tr>\n<td>Full<\/td>\n<td>a<\/td>\n<td>b<\/td>\n<td>c<\/td>\n<\/tr>/);
});

test('::: small gives the lists and paragraphs inside it class="small"', () => {
  const block = '\n::: small\n- one\n- two\n\nA note.\n:::\n';
  const { html } = rendered((root) => edit(root, 'docs/plan/01-flow.md', (t) => t + block));
  assert.match(
    html,
    /<ul class="small">\n<li>one<\/li>\n<li>two<\/li>\n<\/ul>\n<p class="small">A note\.<\/p>/,
  );
});

test('milestones render as .ms blocks, with criteria coloured by status', () => {
  const { html } = rendered();
  assert.match(html, /<p>Each milestone is a slice that runs end to end\.<\/p>/);
  assert.match(
    html,
    /<div class="ms"><div class="tag">M0<\/div><div class="card">\n<h4>Foundations<\/h4>\n<ul class="small">\n<li id="M0.aa">/,
  );
  assert.match(
    itemHtml(html, 'M0.aa'),
    /<div class="dw"><b>Done when<\/b> <span class="c-pass">\(a\)<\/span> a test asserts the first thing works end to end; <span class="c-open">\(b\)<\/span> a test asserts the second thing works end to end\.<\/div><\/li>$/,
  );
  assert.match(itemHtml(html, 'M0.dd'), /<span class="c-fail">\(a\)<\/span>/);
  assert.match(itemHtml(html, 'M0.aa'), /The first item, with <b>bold<\/b> words\./);
});

test('an exit shows its done-when, and a sign-off-only exit says so', () => {
  const { html } = rendered();
  assert.match(
    html,
    /<div class="exit"><b>Done when<\/b> you sign in and it works\. <span class="pill t-lib">done<\/span><\/div>\n<div class="dw">Checked by Sofia's sign-off<\/div>/,
  );
  assert.match(
    html,
    /<div class="exit"><b>Done when<\/b> Browse finds you something\. ?<\/div>\n<div class="dw"><b>Done when<\/b> <span class="c-open">\(a\)<\/span> a test replays/,
  );
  const m6 = html.slice(html.indexOf('<div class="tag">M6</div>'));
  assert.doesNotMatch(m6.slice(0, m6.indexOf('</section>')), /class="exit"/);
});

test('the Now section shows progress per milestone, next, in flight, failing and the checks source', () => {
  const { html, commits } = rendered();
  const now = html.slice(
    html.indexOf('<section id="now">'),
    html.indexOf('</section>', html.indexOf('<section id="now">')),
  );
  assert.match(now, /<div class="grid g2">/);
  assert.match(now, /<h4>Progress<\/h4>/);
  assert.match(now, /M0 2\/5 · M1 0\/2 · M2 0\/2 · M3 0\/2 · M4 0\/2 · M5 0\/2 · M6 0\/1/);
  assert.match(now, /Next: <a href="#M0.cc">M0.cc<\/a> The third item\./);
  assert.match(now, /<code>plan\/M0.aa<\/code> parser done; next: lint/);
  assert.match(now, /Failing: <a href="#M0.dd">M0.dd<\/a> \(a\)/);
  assert.ok(now.includes(`CI@${commits.third.slice(0, 7)} (1 behind HEAD)`));
  assert.match(
    now,
    /<h4>Recently sorted ideas<\/h4>\n<ul class="small"><li><code>gapless-idea\.md<\/code> → M1\.play<\/li>/,
  );
});

test('[M0.plan/b] the Now section lists inbox ideas waiting to be sorted, with title and file', () => {
  const { html } = rendered((root) => {
    write(root, 'docs/inbox/README.md', '# Inbox\n\nHow the inbox works.\n');
    write(root, 'docs/inbox/shuffle.md', '# Shuffle by album\n\n> shuffle albums, not tracks\n');
    write(root, 'docs/inbox/a-sleep.md', '# Sleep timer <soon>\n\n> a sleep timer\n');
  });
  assert.match(
    html,
    /<h4>Recently sorted ideas<\/h4>\n<ul class="small">.*<\/ul>\n<h4>Waiting to be sorted \(2\)<\/h4>\n<ul class="small"><li>Sleep timer &lt;soon&gt; <code>a-sleep\.md<\/code><\/li><li>Shuffle by album <code>shuffle\.md<\/code><\/li><\/ul>/,
  );
  assert.doesNotMatch(html, /README\.md<\/code>/);
});

test('[M0.plan/b] with an empty inbox, the page says nothing is waiting to be sorted', () => {
  const { html } = rendered();
  assert.match(
    html,
    /<h4>Waiting to be sorted \(0\)<\/h4>\n<ul class="small"><li>None\.<\/li><\/ul>/,
  );
});

test('with nothing in the outbox, the page says nothing is waiting', () => {
  const { html } = rendered((root) => git(root, 'rm', '-q', 'docs/outbox/screenshots.md'));
  assert.match(html, /<div class="callout">Nothing is waiting on you\.<\/div>/);
});

test('render.mjs --draft writes the page and a draft stamp, even with uncommitted changes', () => {
  const { root, commits } = fixtureRepo();
  try {
    edit(root, 'docs/plan/01-flow.md', (t) => `${t}\nAn uncommitted sentence.\n`);
    const out = execFileSync('node', [CLI, '--root', root, '--draft', '--results', 'none'], {
      encoding: 'utf8',
    });
    assert.match(out, /build\/plan\/index\.html/);
    const html = read(root, 'build/plan/index.html');
    assert.match(html, /An uncommitted sentence\./);
    assert.match(html, /checks from unavailable · draft, uncommitted changes<\/footer>/);
    const stamp = JSON.parse(read(root, 'build/plan/stamp.json'));
    assert.deepEqual(Object.keys(stamp), ['commit', 'tree', 'renderedAt', 'draft']);
    assert.equal(stamp.commit, commits.head);
    assert.equal(stamp.draft, true);
    assert.equal(stamp.tree, sourcesTree(root, SOURCES.plan), 'the plan and outbox trees combined');
  } finally {
    removeTree(root);
  }
});

test('render.mjs refuses uncommitted plan changes without --draft, and any lint error', () => {
  const { root } = fixtureRepo();
  try {
    edit(root, 'docs/plan/01-flow.md', (t) => `${t}\nAn uncommitted sentence.\n`);
    assert.throws(
      () => execFileSync('node', [CLI, '--root', root, '--results', 'none'], { stdio: 'pipe' }),
      /uncommitted/,
    );
    edit(root, 'docs/plan/01-flow.md', (t) => `${t}\n::: aside\n`);
    assert.throws(
      () =>
        execFileSync('node', [CLI, '--root', root, '--draft', '--results', 'none'], {
          stdio: 'pipe',
        }),
      /unknown directive/,
    );
    rmSync(join(root, 'build'), { recursive: true, force: true });
    assert.equal(existsSync(join(root, 'build/plan/index.html')), false);
  } finally {
    removeTree(root);
  }
});
