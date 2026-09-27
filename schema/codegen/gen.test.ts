import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { OUTPUTS } from './outputs.js';

const schemaDir = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = join(schemaDir, '..');

function gen(args: string[]) {
  // A child process, so the CLI itself runs and a temporary copy's modules never mix with ours.
  execFileSync(process.execPath, ['--import', 'tsx', 'codegen/gen.ts', ...args], {
    cwd: schemaDir, // `--import tsx` resolves from here: tsx is a devDependency of schema/
    stdio: 'pipe',
  });
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
}

describe('pnpm gen', () => {
  let tmp: string;
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it(
    '[M0.schema/a] regenerating from schema/ reproduces the committed OpenAPI document and both clients',
    { timeout: 60_000 },
    () => {
      tmp = mkdtempSync(join(tmpdir(), 'auralis-schema-'));
      gen(['--out', tmp]);
      for (const rel of Object.values(OUTPUTS)) {
        expect(readFileSync(join(tmp, rel), 'utf8'), rel).toBe(
          readFileSync(join(repoRoot, rel), 'utf8'),
        );
      }
      expect(filesUnder(tmp)).toEqual(Object.values(OUTPUTS).sort());
    },
  );

  it(
    '[M0.schema/b] a field added to a zod schema appears in the OpenAPI document and both generated clients',
    { timeout: 60_000 },
    () => {
      tmp = mkdtempSync(join(tmpdir(), 'auralis-schema-'));
      cpSync(join(schemaDir, 'src'), join(tmp, 'src'), { recursive: true });
      symlinkSync(join(schemaDir, 'node_modules'), join(tmp, 'node_modules'), 'dir');

      const healthFile = join(tmp, 'src', 'health.ts');
      const original = readFileSync(healthFile, 'utf8');
      const probed = original.replace(
        '  .object({\n',
        '  .object({\n    schemaProbe: z.string(),\n',
      );
      expect(probed).not.toBe(original);
      writeFileSync(healthFile, probed);

      const out = join(tmp, 'out');
      gen(['--src', join(tmp, 'src'), '--out', out]);

      const doc = JSON.parse(readFileSync(join(out, OUTPUTS.openapi), 'utf8'));
      const health = doc.components.schemas.HealthResponse;
      expect(health.properties.schemaProbe).toEqual({ type: 'string' });
      expect(health.required).toContain('schemaProbe');
      expect(readFileSync(join(out, OUTPUTS.typescript), 'utf8')).toMatch(
        /^\s+schemaProbe: string;$/m,
      );
      expect(readFileSync(join(out, OUTPUTS.kotlin), 'utf8')).toMatch(
        /^\s+val schemaProbe: String,$/m,
      );

      for (const rel of Object.values(OUTPUTS)) {
        expect(readFileSync(join(repoRoot, rel), 'utf8'), rel).not.toContain('schemaProbe');
      }
    },
  );
});
