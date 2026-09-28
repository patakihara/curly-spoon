/** Test support: a throwaway Sonora tree built from `.d.ts` sources, read into the props model. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { type PropsModel, readProps } from './props.js';
import { discoverComponents } from './sonora.js';

/** `sources` maps `<folder>/<Name>.d.ts` to its text; each gets a stub `.jsx` beside it. */
export function modelOf(sources: Record<string, string>): PropsModel {
  const dir = mkdtempSync(join(tmpdir(), 'auralis-uikit-props-'));
  try {
    for (const [rel, text] of Object.entries(sources)) {
      const file = join(dir, 'components', rel);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
      const name = basename(rel, '.d.ts');
      writeFileSync(join(dirname(file), `${name}.jsx`), `export function ${name}() {}\n`);
    }
    return readProps(discoverComponents(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A one-component tree whose `XProps` holds exactly `members`. */
export function oneComponent(members: string, preamble = "import { ReactNode } from 'react';\n") {
  return {
    'core/X.d.ts': `${preamble}\nexport interface XProps {\n${members}\n}\nexport declare function X(props: XProps): JSX.Element;\n`,
  };
}
