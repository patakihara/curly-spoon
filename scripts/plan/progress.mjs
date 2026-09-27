/**
 * Plan progress, computed from the repo and never written to it: each criterion's status from
 * test results (results.mjs) or its sign-off tag, items in flight from plan/<ID> branches, the
 * outbox, recent Decision: lines and recently sorted inbox ideas.
 *
 * CLI: node scripts/plan/progress.mjs [--summary] [--local|--no-results] [--json] [--root <dir>]
 *   [--gh-deadline <epoch ms>]
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readPlan } from './parse.mjs';
import { defaultExec, git, loadResults } from './results.mjs';

const tryGit = (exec, root, ...args) => {
  try {
    return git(exec, root, ...args);
  } catch {
    return null;
  }
};

/** `failed` if any tagged test failed, `passed` if one passed, else `missing`; `unknown` without results. */
export function criterionStatus(tests, resultsError) {
  if (resultsError) return 'unknown';
  if (tests.some((t) => t.status === 'failed')) return 'failed';
  if (tests.some((t) => t.status === 'passed')) return 'passed';
  return 'missing';
}

/** `done` if every criterion passed, `failing` if any failed, else `open`. */
export function itemStatus(criteria) {
  if (criteria.length && criteria.every((c) => c.status === 'passed')) return 'done';
  if (criteria.some((c) => c.status === 'failed')) return 'failing';
  return 'open';
}

/** plan/<ID> and plan/<ID>-<anything> branches, local first, then origin-only. */
function planBranches(exec, root) {
  const out =
    tryGit(
      exec,
      root,
      'for-each-ref',
      '--format=%(refname)',
      'refs/heads/plan/',
      'refs/remotes/origin/plan/',
    ) ?? '';
  const branches = new Map();
  for (const ref of out.split('\n').filter(Boolean)) {
    const local = ref.startsWith('refs/heads/');
    const name = ref.replace(/^refs\/(heads|remotes\/origin)\//, '');
    if (branches.has(name)) continue;
    const note = local ? tryGit(exec, root, 'config', `branch.${name}.description`) : null;
    branches.set(name, { name, note: note || 'no note' });
  }
  return [...branches.values()];
}

const branchesFor = (id, branches) =>
  branches.filter((b) => b.name === `plan/${id}` || b.name.startsWith(`plan/${id}-`));

function readOutbox(root) {
  const dir = join(root, 'docs', 'outbox');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .sort()
    .map((file) => {
      const lines = readFileSync(join(dir, file), 'utf8').split('\n');
      const field = (key) =>
        lines
          .slice(0, 6)
          .find((l) => l.startsWith(`${key}: `))
          ?.slice(key.length + 2) ?? '';
      return {
        file,
        title: (lines[0] ?? '').replace(/^# /, ''),
        kind: field('kind'),
        default: field('default'),
      };
    });
}

/** The ideas still in docs/inbox, each `{ file, title }`, title from its `# ` line. */
function readWaitingIdeas(root) {
  const dir = join(root, 'docs', 'inbox');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .sort()
    .map((file) => {
      const heading = readFileSync(join(dir, file), 'utf8')
        .split('\n')
        .find((l) => l.startsWith('# '));
      return { file, title: heading ? heading.slice(2).trim() : file.replace(/\.md$/, '') };
    });
}

function readDecisions(exec, root) {
  const log = tryGit(exec, root, 'log', '-n', '300', '--format=%H%x1f%cs%x1f%B%x1e') ?? '';
  const decisions = [];
  for (const record of log.split('\x1e')) {
    const [sha, date, body] = record.replace(/^\n/, '').split('\x1f');
    if (!body) continue;
    for (const m of body.matchAll(/^Decision: (.+)$/gm))
      decisions.push({ sha, date, text: m[1].trim() });
  }
  return decisions.slice(0, 8);
}

function readSortedIdeas(exec, root) {
  const log =
    tryGit(
      exec,
      root,
      'log',
      '-n',
      '300',
      '--diff-filter=D',
      '--name-only',
      '--format=%x1e%H%x1f%cs%x1f%B%x1d',
      '--',
      'docs/inbox',
    ) ?? '';
  const ideas = [];
  for (const record of log.split('\x1e').filter((r) => r.trim())) {
    const [head, names = ''] = record.split('\x1d');
    const [sha, date, body = ''] = head.split('\x1f');
    const plan = /^Plan: (.+)$/m.exec(body)?.[1].trim() ?? null;
    for (const file of names.split('\n').map((n) => n.trim())) {
      if (/^docs\/inbox\/.+\.md$/.test(file) && file !== 'docs/inbox/README.md')
        ideas.push({ sha, date, file, plan });
    }
  }
  return ideas.slice(0, 8);
}

/**
 * Computes the plan's progress for the repo at `root`. `results`: 'ci' (default), 'local' or
 * 'none'. Returns the JSON-serialisable Progress object that --json prints.
 */
export function computeProgress({ root, results = 'ci', exec = defaultExec, ghDeadline }) {
  const plan = readPlan(join(root, 'docs', 'plan'), []);
  const loaded = loadResults({ root, mode: results, exec, ghDeadline });
  const signoffs = new Set(
    (tryGit(exec, root, 'tag', '-l', 'signoff/*') ?? '').split('\n').filter(Boolean),
  );
  const branches = planBranches(exec, root);

  const milestones = plan.milestones.map((m) => {
    const items = m.items.map((item) => {
      const criteria = item.criteria.map((c) => {
        if (c.kind === 'signoff') {
          return {
            ...c,
            status: signoffs.has(`signoff/${item.id}`) ? 'passed' : 'missing',
            tests: [],
          };
        }
        const tests = loaded.tests.filter((t) => t.item === item.id && t.criterion === c.label);
        return {
          ...c,
          status: criterionStatus(tests, loaded.error),
          tests: tests.map((t) => t.name),
        };
      });
      const own = branchesFor(item.id, branches);
      return {
        id: item.id,
        text: item.text,
        isExit: item.isExit,
        status: itemStatus(criteria),
        inProgress: own.length > 0,
        branches: own,
        criteria,
      };
    });
    return {
      id: m.id,
      title: m.title,
      done: items.filter((i) => i.status === 'done').length,
      total: items.length,
      items,
    };
  });

  const currentMs = milestones.find((m) => m.items.some((i) => i.status !== 'done')) ?? null;
  let next = null;
  if (currentMs) {
    const othersDone = currentMs.items.every((i) => i.isExit || i.status === 'done');
    const candidate = currentMs.items.find(
      (i) => i.status !== 'done' && !i.inProgress && (!i.isExit || othersDone),
    );
    if (candidate) next = { id: candidate.id, text: candidate.text };
  }

  const all = milestones.flatMap((m) => m.items);
  const outbox = readOutbox(root);
  return {
    commit: tryGit(exec, root, 'rev-parse', 'HEAD'),
    commitDate: tryGit(exec, root, 'log', '-1', '--format=%cs'),
    results: { sources: loaded.sources, error: loaded.error },
    milestones,
    current: currentMs?.id ?? null,
    next,
    inFlight: all.flatMap((i) =>
      i.branches.map((b) => ({ item: i.id, branch: b.name, note: b.note })),
    ),
    failing: all.flatMap((i) =>
      i.criteria
        .filter((c) => c.status === 'failed')
        .map((c) => ({ item: i.id, criterion: c.label, tests: c.tests })),
    ),
    outbox,
    overAsking: outbox.length > 5,
    decisions: readDecisions(exec, root),
    sortedIdeas: readSortedIdeas(exec, root),
    waitingIdeas: readWaitingIdeas(root),
  };
}

/** "CI@1a2b3c4 (2 behind HEAD)" per source, or null when results are unavailable. */
export function sourcesLine(progress) {
  if (progress.results.error) return null;
  return progress.results.sources
    .map(
      (s) =>
        `${s.workflow}@${s.commit.slice(0, 7)} (${s.behind ? `${s.behind} behind HEAD` : 'at HEAD'})`,
    )
    .join(', ');
}

const plain = (text, max = 110) => {
  const t = text.replace(/\*\*/g, '');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** The session-start summary: at most 25 lines. */
export function formatSummary(p) {
  const checks = p.results.error
    ? `checks unavailable: ${p.results.error}`
    : `checks from ${sourcesLine(p)}`;
  const current = p.milestones.find((m) => m.id === p.current);
  const lines = [];
  if (!p.milestones.length) lines.push(`Auralis plan · no milestones yet · ${checks}`);
  else if (!current) lines.push(`Auralis plan · every milestone done · ${checks}`);
  else
    lines.push(
      `Auralis plan · current ${current.id} ${current.title} · ${current.done}/${current.total} done · ${checks}`,
    );
  const done = p.milestones.flatMap((m) => m.items).filter((i) => i.status === 'done');
  lines.push(
    done.length ? `Done (${done.length}): ${done.map((i) => i.id).join(', ')}` : 'Done: nothing',
  );
  lines.push(`Next: ${p.next ? `${p.next.id}: ${plain(p.next.text)}` : 'nothing'}`);
  lines.push(
    `In flight: ${p.inFlight.map((f) => `${f.branch}: "${f.note}"`).join(' · ') || 'nothing'}`,
  );
  lines.push(
    `Failing: ${p.failing.map((f) => `${f.item} (${f.criterion}): ${f.tests.join(', ')}`).join(' · ') || 'nothing'}`,
  );
  lines.push(
    p.outbox.length
      ? `Waiting on you (${p.outbox.length}): ${p.outbox.map((o) => `${o.title} (default: ${plain(o.default, 80)})`).join(' · ')}`
      : 'Waiting on you: nothing',
  );
  if (p.overAsking) lines.push('More than five open outbox items: sessions are over-asking.');
  lines.push(
    `Recent decisions: ${p.decisions.map((d) => `${d.sha.slice(0, 7)} ${plain(d.text, 80)}`).join(' · ') || 'none'}`,
  );
  return lines.slice(0, 25).join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      summary: { type: 'boolean' },
      json: { type: 'boolean' },
      local: { type: 'boolean' },
      'no-results': { type: 'boolean' },
      root: { type: 'string' },
      'gh-deadline': { type: 'string' },
    },
  });
  const root = values.root ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
  const results = values['no-results'] ? 'none' : values.local ? 'local' : 'ci';
  const ghDeadline = values['gh-deadline'] ? Number(values['gh-deadline']) : undefined;
  const progress = computeProgress({ root, results, ghDeadline });
  console.log(values.json ? JSON.stringify(progress, null, 2) : formatSummary(progress));
}
