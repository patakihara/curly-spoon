/**
 * Prints a subagent brief for one plan item: the plan's standing rules for subagents verbatim,
 * then the item's line and done-when from the milestones section, then an empty `## Task`
 * heading for the orchestrator to fill.
 *
 * CLI: node scripts/plan/brief.mjs <item id>   (exit 1 on an unknown id or a broken plan)
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MILESTONES_ID, readPlan, STANDING_RULES_HEADING, standingRules } from './parse.mjs';

/** The brief for `id` from the plan in `root`; throws with a one-line message on failure. */
export function buildBrief(root, id) {
  const errors = [];
  const plan = readPlan(join(root, 'docs', 'plan'), errors);
  if (errors.length) throw new Error(`docs/plan does not parse: ${errors[0]}`);
  const rules = standingRules(plan);
  if (!rules) throw new Error(`docs/plan has no "${STANDING_RULES_HEADING}" subsection`);
  const item = plan.milestones.flatMap((m) => m.items).find((i) => i.id === id);
  if (!item) throw new Error(`${id} is no item in docs/plan`);
  const section = plan.sections.find((s) => s.id === MILESTONES_ID);
  const at = item.line - section.bodyLine;
  const itemLines = section.lines.slice(at, at + 2);
  return `${rules}\n\n## Item\n\n${itemLines.join('\n')}\n\n## Task\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const id = process.argv[2];
  if (!id) {
    process.stderr.write('usage: node scripts/plan/brief.mjs <item id>\n');
    process.exit(1);
  }
  try {
    const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
    process.stdout.write(buildBrief(root, id));
  } catch (error) {
    process.stderr.write(`brief: ${error.message}\n`);
    process.exit(1);
  }
}
