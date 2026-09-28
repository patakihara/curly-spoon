/**
 * SessionStart hook: opens with the orchestrator's instruction to read all of docs/plan before
 * anything else (on every source: startup, resume, clear and compact) and the brief command,
 * then puts the plan's progress summary (scripts/plan/progress.mjs --summary) and
 * a reminder to read the published artifacts' open comments into the session's context. Every
 * `gh` call is killed a little before AURALIS_SUMMARY_TIMEOUT_MS (default 20000), so none
 * outlives the hook, and the summary is shown with checks unavailable. AURALIS_GH_TIMEOUT_MS
 * sets that gh cut on its own, leaving the rest of the budget to progress.mjs. If progress.mjs
 * itself overruns the budget it is killed and rerun without CI results. Fails open: the
 * read-the-plan and brief lines always print, and a one-line note stands in for a failed summary.
 *
 * CLI: node scripts/guards/session-start.mjs < payload.json
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { repoRoot, runHook } from './hook.mjs';

const OWN_PROGRESS = fileURLToPath(new URL('../plan/progress.mjs', import.meta.url));

const summary = (progress, root, extra, timeout) =>
  spawnSync(process.execPath, [progress, '--summary', '--root', root, ...extra], {
    encoding: 'utf8',
    timeout,
    killSignal: 'SIGKILL',
  });

/** The opening lines: read the whole plan first, again after a compaction, and brief from it. */
function readPlanLines(source) {
  const when =
    source === 'compact' ? 'again after this compaction' : 'now, and again after every compaction';
  return [
    `Orchestrator: before any other work, read every file in docs/plan in full ${when} (README.md and every section); it is the only source of truth.`,
    'Brief subagents with node scripts/plan/brief.mjs <id>; the brief opens with the standing rules for subagents.',
  ];
}

function commentsLine(root) {
  let published = {};
  try {
    published = JSON.parse(readFileSync(join(root, 'design', 'published.json'), 'utf8'));
  } catch {
    // no record yet
  }
  const urls = Object.entries(published)
    .filter(([, entry]) => entry?.url)
    .map(([artifact, entry]) => `${artifact} ${entry.url}`);
  return `Before other work, read open comments on the plan, Sonora and canvas artifacts with the ArtifactComments tool: ${urls.length ? urls.join(', ') : '(none published yet)'}`;
}

/** The progress summary's lines, plus a note when CI results timed out; throws if it fails. */
function summaryLines(root) {
  const budget = Number(process.env.AURALIS_SUMMARY_TIMEOUT_MS) || 20000;
  const ghCut = Number(process.env.AURALIS_GH_TIMEOUT_MS) || budget - Math.min(2000, budget / 4);
  const ghDeadline = Date.now() + Math.min(ghCut, budget);
  const local = join(root, 'scripts', 'plan', 'progress.mjs');
  const progress = existsSync(local) ? local : OWN_PROGRESS;
  let result = summary(progress, root, ['--gh-deadline', String(ghDeadline)], budget);
  const extra = [];
  if (result.error?.code === 'ETIMEDOUT' || result.signal) {
    result = summary(progress, root, ['--no-results'], 5000);
    extra.push(`(CI results timed out after ${Math.round(budget / 1000)} s; shown without them)`);
  }
  const text = (result.stdout ?? '').trim();
  if (result.status !== 0 || !text) {
    const first =
      (result.stderr ?? '').trim().split('\n')[0] || result.error?.message || 'no output';
    throw new Error(`progress.mjs failed: ${first}`);
  }
  return [text, ...extra];
}

runHook('session-start', (payload) => {
  const lines = readPlanLines(payload?.source);
  try {
    const root = repoRoot(payload);
    try {
      lines.push(...summaryLines(root));
    } catch (error) {
      process.stderr.write(`session-start: ${error.message}\n`);
      lines.push(`Progress summary unavailable: ${error.message}`);
    }
    lines.push(commentsLine(root));
  } catch (error) {
    lines.push(`Progress summary unavailable: ${error.message}`);
  }
  return {
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join('\n') },
  };
});
