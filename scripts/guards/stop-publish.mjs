/**
 * Stop hook: asks the session to publish before it ends when a published source (plan, and the
 * others in published-sources.json) differs from design/published.json, committed or not. It
 * blocks at most once per stop attempt (stop_hook_active lets the second stop through), never a
 * subagent, and never while the usage gate is denying tools: it reads the gate's cached verdict
 * read-only, and never calls ssh or budget.py. Fails open on any error.
 *
 * CLI: node scripts/guards/stop-publish.mjs < payload.json
 */
import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { repoRoot, runHook } from './hook.mjs';
import { describeDrift, publishedDrift } from './published.mjs';

const FRESH_MS = 15 * 60 * 1000;

function gateBlocking() {
  const cache = join(
    process.env.XDG_CACHE_HOME || join(process.env.HOME || homedir(), '.cache'),
    'auralis-budget.json',
  );
  try {
    const fresh = Date.now() - statSync(cache).mtimeMs < FRESH_MS;
    return fresh && JSON.parse(readFileSync(cache, 'utf8')).verdict === 'over';
  } catch {
    return false;
  }
}

runHook('stop-publish', (payload) => {
  if (payload.stop_hook_active === true) return null;
  if (payload.hook_event_name === 'SubagentStop') return null;
  if (typeof payload.agent_id === 'string' && payload.agent_id) return null;
  if (gateBlocking()) return null;
  const drift = publishedDrift({ root: repoRoot(payload), worktree: true });
  if (!drift.length) return null;
  return {
    decision: 'block',
    reason: `Unpublished changes:\n${describeDrift(drift).join('\n')}\nCommit them, render and publish (docs/plan/README.md, Commands and the publishing steps), run record-publish.mjs and commit design/published.json. If publishing cannot happen now, say why in one line and stop again.`,
  };
});
