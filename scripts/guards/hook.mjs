/**
 * What the three Claude Code hooks in this folder share: reading the payload from stdin, finding
 * the repo root, and failing open. Not a hook itself.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/** The git toplevel of the payload's cwd, else of CLAUDE_PROJECT_DIR, else of process.cwd(). */
export function repoRoot(payload) {
  for (const dir of [payload?.cwd, process.env.CLAUDE_PROJECT_DIR, process.cwd()]) {
    if (!dir) continue;
    try {
      return execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      // try the next candidate
    }
  }
  throw new Error('not inside a git repository');
}

/** Runs `body(payload)` with the stdin JSON; any error is one stderr line and an allow. */
export function runHook(name, body) {
  try {
    const out = body(JSON.parse(readFileSync(0, 'utf8')));
    if (out) process.stdout.write(JSON.stringify(out) + '\n');
  } catch (error) {
    process.stderr.write(`${name}: ${error.message}; allowing\n`);
  }
  process.exitCode = 0;
}
