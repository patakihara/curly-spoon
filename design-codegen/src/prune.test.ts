import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { componentPages } from './compare.js';
import { APP_DIR, REPO_ROOT, SONORA_DIR } from './outputs.js';
import { discoverComponents } from './sonora.js';

const appDir = join(REPO_ROOT, APP_DIR);
const sonoraDir = join(REPO_ROOT, SONORA_DIR);

describe("Sonora's components, pruned to the canvas", () => {
  it('[M0.canvas/b] are each drawn by at least one page of nav.json, directly or through another', () => {
    const pages = componentPages(appDir, sonoraDir);
    const unused = discoverComponents(sonoraDir)
      .map((c) => c.name)
      .filter((name) => (pages.get(name) ?? []).length === 0);
    expect(unused).toEqual([]);
  });

  it('[M0.canvas/b] are exactly the components the manifest lists', () => {
    const manifest = JSON.parse(readFileSync(join(sonoraDir, '_ds_manifest.json'), 'utf8')) as {
      components: { name: string; sourcePath: string }[];
    };
    const onDisk = discoverComponents(sonoraDir).map((c) => ({
      name: c.name,
      sourcePath: `components/${c.folder}/${c.name}.jsx`,
    }));
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    expect([...manifest.components].sort(byName)).toEqual(onDisk.sort(byName));
  });

  describe('when one is drawn by no page', () => {
    let tmp: string | undefined;
    afterEach(() => {
      if (tmp !== undefined) rmSync(tmp, { recursive: true, force: true });
      tmp = undefined;
    });

    it('[M0.canvas/b] names none of the pages for it, while naming those for one reached only through another', () => {
      tmp = mkdtempSync(join(tmpdir(), 'auralis-prune-'));
      cpSync(join(sonoraDir, 'components'), join(tmp, 'components'), { recursive: true });
      const folder = discoverComponents(tmp)[0]!.folder;
      writeFileSync(join(tmp, 'components', folder, 'Lonely.jsx'), 'export function Lonely() {}\n');
      writeFileSync(
        join(tmp, 'components', folder, 'Lonely.d.ts'),
        'export interface LonelyProps {}\n',
      );
      const pages = componentPages(appDir, tmp);
      expect(pages.get('Lonely') ?? []).toEqual([]);
      // FieldRow draws Input through its NS() lookup; settings draws FieldRow.
      expect(pages.get('Input')).toContain('settings');
    });
  });
});
