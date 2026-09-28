/** Sonora's components: every `components/<folder>/<Name>.jsx` paired with its `<Name>.d.ts`. */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface Component {
  name: string;
  /** The folder under `components/`, such as `core` or `media`. */
  folder: string;
  jsx: string;
  dts: string;
}

/** The components under `<sonoraDir>/components`, sorted by name. Refuses a half pair or a twin. */
export function discoverComponents(sonoraDir: string): Component[] {
  const root = join(sonoraDir, 'components');
  const byName = new Map<string, Component>();
  const folders = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const folder of folders) {
    const files = readdirSync(join(root, folder)).sort();
    const names = new Set<string>();
    for (const file of files) {
      const match = /^([A-Z][A-Za-z0-9]*)\.(jsx|d\.ts)$/.exec(file);
      if (match === null) continue;
      const [, name, ext] = match as unknown as [string, string, string];
      const other = ext === 'jsx' ? `${name}.d.ts` : `${name}.jsx`;
      if (!existsSync(join(root, folder, other))) {
        throw new Error(`${folder}/${file} has no ${other}`);
      }
      names.add(name);
    }
    for (const name of names) {
      const twin = byName.get(name);
      if (twin !== undefined) {
        throw new Error(`${name} is both ${twin.folder}/${name} and ${folder}/${name}`);
      }
      byName.set(name, {
        name,
        folder,
        jsx: join(root, folder, `${name}.jsx`),
        dts: join(root, folder, `${name}.d.ts`),
      });
    }
  }
  return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
