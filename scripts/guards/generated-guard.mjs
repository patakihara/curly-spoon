/**
 * PreToolUse hook for Edit|Write|MultiEdit|NotebookEdit: refuses a hand edit to generated code.
 * Generated code always lives under a path segment named `generated` (`web/src/generated/`,
 * `schema/generated/`, `android/app/src/main/kotlin/.../generated/`). Generators write through
 * node, not Claude's tools, so they are unaffected.
 *
 * Limitation: a Bash redirect or `sed -i` into a generated folder is not seen; the
 * regenerate-and-diff check is the backstop.
 *
 * CLI: node scripts/guards/generated-guard.mjs < payload.json
 */
import { isAbsolute, relative, resolve } from 'node:path';
import { repoRoot, runHook } from './hook.mjs';

function roots(payload) {
  const found = [];
  try {
    found.push(repoRoot(payload));
  } catch {
    // no git root; CLAUDE_PROJECT_DIR may still apply
  }
  if (process.env.CLAUDE_PROJECT_DIR) found.push(resolve(process.env.CLAUDE_PROJECT_DIR));
  return [...new Set(found)];
}

runHook('generated-guard', (payload) => {
  const target = payload.tool_input?.file_path ?? payload.tool_input?.notebook_path;
  if (!target) return null;
  const path = resolve(payload.cwd ?? process.cwd(), target);
  for (const root of roots(payload)) {
    const rel = relative(root, path);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) continue;
    const segments = rel.split(/[/\\]/);
    if (!segments.slice(0, -1).includes('generated')) continue;
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `${segments.join('/')} is generated code, and generated folders are never edited by hand. Change the source in design/ or schema/ and rerun its generator.`,
      },
    };
  }
  return null;
});
