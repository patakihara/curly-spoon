import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { OUTPUTS, SONORA_DIR } from './outputs.js';

const packageDir = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = join(packageDir, '..');
const fixtures = fileURLToPath(new URL('./fixtures/sonora', import.meta.url));

function gen(args: string[]) {
  // A child process, so the CLI itself runs; `--import tsx` resolves from design-codegen/.
  execFileSync(process.execPath, ['--import', 'tsx', 'src/gen.ts', ...args], {
    cwd: packageDir,
    stdio: 'pipe',
  });
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
}

/** Sonora's tokens and their export, which every `pnpm gen` run reads, copied into `sonora`. */
function withTokens(sonora: string) {
  for (const dir of ['tokens', 'export']) {
    cpSync(join(repoRoot, SONORA_DIR, dir), join(sonora, dir), { recursive: true });
  }
}

/** Every file under both outputs, as `<output root>/<path>`, relative to `root`. */
const outputFiles = (root: string) =>
  Object.values(OUTPUTS).flatMap((rel) => filesUnder(join(root, rel)).map((f) => `${rel}/${f}`));

describe('pnpm gen, from design/sonora', () => {
  let tmp: string | undefined;
  afterEach(() => {
    if (tmp !== undefined) rmSync(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it(
    '[M0.uikit/a] regenerating from design/sonora reproduces the committed web UI package and Android props',
    { timeout: 120_000 },
    () => {
      tmp = mkdtempSync(join(tmpdir(), 'auralis-uikit-'));
      gen(['--out', tmp]);
      const committed = outputFiles(repoRoot);
      expect(outputFiles(tmp)).toEqual(committed);
      for (const rel of committed) {
        expect(readFileSync(join(tmp, rel), 'utf8'), rel).toBe(
          readFileSync(join(repoRoot, rel), 'utf8'),
        );
      }
    },
  );

  it(
    '[M0.uikit/a] every Sonora component with a .d.ts has a web export and a generated Kotlin props class',
    { timeout: 120_000 },
    async () => {
      const names = readdirSync(join(repoRoot, SONORA_DIR, 'components'), { recursive: true })
        .map(String)
        .filter((f) => f.endsWith('.d.ts'))
        .map((f) => basename(f, '.d.ts'))
        .sort();
      expect(names.length).toBeGreaterThan(0);
      const index = join(repoRoot, OUTPUTS.web, 'index.js');
      const mod = (await import(pathToFileURL(index).href)) as Record<string, unknown>;
      for (const name of names) {
        expect(typeof mod[name], `${name} is exported from the web UI package`).toBe('function');
        const kt = join(repoRoot, OUTPUTS.kotlin, `${name}Props.kt`);
        expect(existsSync(kt), `${name}Props.kt exists`).toBe(true);
        expect(readFileSync(kt, 'utf8')).toMatch(new RegExp(`^data class ${name}Props\\b`, 'm'));
      }
    },
  );

  it(
    '[M0.uikit/a] a prop added to a Sonora .d.ts appears in both outputs',
    { timeout: 120_000 },
    () => {
      tmp = mkdtempSync(join(tmpdir(), 'auralis-uikit-'));
      const sonora = join(tmp, 'sonora');
      cpSync(join(repoRoot, SONORA_DIR, 'components'), join(sonora, 'components'), {
        recursive: true,
      });
      withTokens(sonora);
      const dts = join(sonora, 'components', 'basic', 'Button.d.ts');
      const original = readFileSync(dts, 'utf8');
      const probed = original.replace(
        'export interface ButtonProps {\n',
        'export interface ButtonProps {\n  uikitProbe?: string;\n',
      );
      expect(probed).not.toBe(original);
      writeFileSync(dts, probed);

      const out = join(tmp, 'out');
      gen(['--sonora', sonora, '--out', out]);
      expect(readFileSync(join(out, OUTPUTS.web, 'basic', 'Button.d.ts'), 'utf8')).toContain(
        '  uikitProbe?: string;\n',
      );
      expect(readFileSync(join(out, OUTPUTS.kotlin, 'ButtonProps.kt'), 'utf8')).toContain(
        '    val uikitProbe: String? = null,\n',
      );
    },
  );

  it(
    '[M0.uikit/a] a component deleted from Sonora leaves both outputs and both indexes',
    { timeout: 120_000 },
    () => {
      tmp = mkdtempSync(join(tmpdir(), 'auralis-uikit-'));
      const sonora = join(tmp, 'sonora');
      cpSync(fixtures, sonora, { recursive: true });
      withTokens(sonora);
      // The canvas's pages use components the fixture lacks, so this run has a canvas of none.
      const app = join(tmp, 'app');
      mkdirSync(app);
      writeFileSync(
        join(app, 'nav.json'),
        JSON.stringify({
          destinations: [],
          layouts: [{ minWidth: 0, nav: 'bottomBar', order: [] }],
          back: {
            close: 'opener',
            stacks: 'perDestination',
            android: 'close',
            web: 'previousView',
          },
          pages: [],
        }),
      );
      writeFileSync(
        join(app, 'shell.json'),
        JSON.stringify({ account: { label: 'Account' }, playing: null, railFoot: [] }),
      );
      const out = join(tmp, 'out');
      gen(['--sonora', sonora, '--app', app, '--out', out]);
      expect(outputFiles(out)).toContain(`${OUTPUTS.kotlin}/EditableListProps.kt`);

      rmSync(join(sonora, 'components', 'layout', 'EditableList.jsx'));
      rmSync(join(sonora, 'components', 'layout', 'EditableList.d.ts'));
      gen(['--sonora', sonora, '--app', app, '--out', out]);

      const files = outputFiles(out);
      for (const gone of [
        `${OUTPUTS.web}/layout/EditableList.jsx`,
        `${OUTPUTS.web}/layout/EditableList.d.ts`,
        `${OUTPUTS.kotlin}/EditableListProps.kt`,
      ]) {
        expect(files).not.toContain(gone);
      }
      expect(files).toContain(`${OUTPUTS.kotlin}/ButtonProps.kt`);
      for (const index of ['index.js', 'index.d.ts']) {
        expect(readFileSync(join(out, OUTPUTS.web, index), 'utf8')).not.toContain('EditableList');
      }
    },
  );
});
