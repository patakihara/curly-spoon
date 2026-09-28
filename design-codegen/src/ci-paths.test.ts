import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { OUTPUTS as SCHEMA_OUTPUTS } from '../../schema/codegen/outputs.js';
import { OUTPUTS, REPO_ROOT } from './outputs.js';

/** The folders CI's "Generated code is current" job diffs after `pnpm gen`. */
function checkedPaths(): string[] {
  const ci = parse(readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8')) as {
    jobs: { generated: { steps: { run?: string }[] } };
  };
  const script = ci.jobs.generated.steps.map((s) => s.run ?? '').join('\n');
  const match = /paths="([^"]*)"/.exec(script);
  return match ? match[1]!.split(/\s+/).filter(Boolean) : [];
}

describe('CI checks every generated folder', () => {
  it('diffs each folder pnpm gen writes after regenerating', () => {
    const paths = checkedPaths();
    const folders = [
      ...Object.values(OUTPUTS),
      ...Object.values(SCHEMA_OUTPUTS).map((file) => file.slice(0, file.lastIndexOf('/'))),
    ];
    for (const folder of folders) {
      expect(
        paths.some((p) => folder === p || folder.startsWith(`${p}/`)),
        folder,
      ).toBe(true);
    }
  });
});
