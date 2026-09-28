/**
 * SessionStart hook: puts the plan's progress summary (scripts/plan/progress.mjs --summary) and
 * a reminder to read the published artifacts' open comments into the session's context. Every
 * `gh` call is killed a little before AURALIS_SUMMARY_TIMEOUT_MS (default 20000), so none
 * outlives the hook, and the summary is shown with checks unavailable. AURALIS_GH_TIMEOUT_MS
 * sets that gh cut on its own, leaving the rest of the budget to progress.mjs. If progress.mjs itself
 * overruns the budget it is killed and rerun without CI results. Fails open: on any error the session starts without it.
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

runHook('session-start', (payload) => {
  const root = repoRoot(payload);
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
  extra.push(commentsLine(root));
  return {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: `${text}\n${extra.join('\n')}`,
    },
  };
});
