import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverComponents } from './sonora.js';
import { generateWeb, HEADER, rewriteJsx } from './web.js';

const fixtures = fileURLToPath(new URL('./fixtures/sonora', import.meta.url));
const fixture = (rel: string) => readFileSync(join(fixtures, 'components', rel), 'utf8');
const NS_LINE =
  "const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};\n";
const known = (names: Record<string, string>) => (name: string) => names[name];

describe('the web UI package', () => {
  let tmp: string | undefined;
  afterEach(() => {
    if (tmp !== undefined) rmSync(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it('[M0.uikit/a] turns `const X = NS().X` into an import and leaves every other byte alone', () => {
    const source = fixture('core/FollowButton.jsx');
    const out = rewriteJsx(source, 'FollowButton.jsx', known({ Button: './Button.jsx' }));
    const expected = source
      .replace(NS_LINE, '')
      .replace('  const Button = NS().Button;\n', '')
      .replace(
        "import React from 'react';\n",
        "import React from 'react';\nimport { Button } from './Button.jsx';\n",
      );
    expect(out).toBe(expected);
  });

  it('[M0.uikit/a] turns `const { A, B } = NS()` into imports', () => {
    const source = fixture('layout/EditableList.jsx');
    const out = rewriteJsx(source, 'EditableList.jsx', known({ Button: '../core/Button.jsx' }));
    const expected = source
      .replace(NS_LINE, '')
      .replace('  const { Button } = NS();\n', '')
      .replace(
        "import React from 'react';\n",
        "import React from 'react';\nimport { Button } from '../core/Button.jsx';\n",
      );
    expect(out).toBe(expected);
  });

  it('[M0.uikit/a] removes NS lookups from a declaration list that also declares something else', () => {
    const source = [
      "import React from 'react';",
      NS_LINE.trimEnd(),
      'export function Header() {',
      '  const Button = NS().Button, size = 3, CoverArt = NS().CoverArt;',
      '  const { Badge, ProgressRing } = NS(), label = "x";',
      '  return null;',
      '}',
      '',
    ].join('\n');
    const out = rewriteJsx(
      source,
      'Header.jsx',
      known({
        Badge: './Badge.jsx',
        Button: './Button.jsx',
        CoverArt: '../media/CoverArt.jsx',
        ProgressRing: './ProgressRing.jsx',
      }),
    );
    expect(out).toBe(
      [
        "import React from 'react';",
        "import { Badge } from './Badge.jsx';",
        "import { Button } from './Button.jsx';",
        "import { CoverArt } from '../media/CoverArt.jsx';",
        "import { ProgressRing } from './ProgressRing.jsx';",
        'export function Header() {',
        '  const size = 3;',
        '  const label = "x";',
        '  return null;',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('[M0.uikit/a] keeps an existing relative import and adds none for a name it already imports', () => {
    const source = fixture('layout/ContentPane.jsx');
    expect(rewriteJsx(source, 'ContentPane.jsx', known({}))).toBe(source);
  });

  it('[M0.uikit/a] refuses an NS name that no component exports', () => {
    const source = fixture('core/FollowButton.jsx');
    expect(() => rewriteJsx(source, 'FollowButton.jsx', known({}))).toThrow(
      /FollowButton\.jsx: NS\(\)\.Button names no Sonora component/,
    );
  });

  it('[M0.uikit/a] refuses any other use of NS or the global namespace', () => {
    const renamed = [
      "import React from 'react';",
      NS_LINE.trimEnd(),
      'export function X() { const Y = NS().Button; return Y; }',
      '',
    ].join('\n');
    expect(() => rewriteJsx(renamed, 'X.jsx', known({ Button: './Button.jsx' }))).toThrow(
      /X\.jsx: unsupported NS\(\) use/,
    );
    const direct = [
      "import React from 'react';",
      'export function X() { return window.SonoraDesignSystem_6c1435.Button; }',
      '',
    ].join('\n');
    expect(() => rewriteJsx(direct, 'X.jsx', known({ Button: './Button.jsx' }))).toThrow(
      /X\.jsx: unsupported use of window\.SonoraDesignSystem_/,
    );
  });

  it('[M0.uikit/a] refuses a .jsx without its .d.ts, and a .d.ts without its .jsx', () => {
    tmp = mkdtempSync(join(tmpdir(), 'auralis-uikit-'));
    mkdirSync(join(tmp, 'components', 'core'), { recursive: true });
    writeFileSync(join(tmp, 'components', 'core', 'Lonely.jsx'), 'export function Lonely() {}\n');
    expect(() => discoverComponents(tmp!)).toThrow(/core\/Lonely\.jsx has no Lonely\.d\.ts/);
    rmSync(join(tmp, 'components', 'core', 'Lonely.jsx'));
    writeFileSync(
      join(tmp, 'components', 'core', 'Ghost.d.ts'),
      'export interface GhostProps {}\n',
    );
    expect(() => discoverComponents(tmp!)).toThrow(/core\/Ghost\.d\.ts has no Ghost\.jsx/);
  });

  it('[M0.uikit/a] refuses two components with the same name', () => {
    tmp = mkdtempSync(join(tmpdir(), 'auralis-uikit-'));
    for (const folder of ['core', 'media']) {
      mkdirSync(join(tmp, 'components', folder), { recursive: true });
      writeFileSync(join(tmp, 'components', folder, 'Twin.jsx'), 'export function Twin() {}\n');
      writeFileSync(
        join(tmp, 'components', folder, 'Twin.d.ts'),
        'export interface TwinProps {}\n',
      );
    }
    expect(() => discoverComponents(tmp!)).toThrow(/Twin is both core\/Twin and media\/Twin/);
  });

  it('[M0.uikit/a] writes each component beside its .d.ts, headed, with both indexes sorted by name', () => {
    const files = generateWeb(discoverComponents(fixtures));
    expect([...files.keys()].sort()).toEqual([
      'core/Button.d.ts',
      'core/Button.jsx',
      'core/FollowButton.d.ts',
      'core/FollowButton.jsx',
      'index.d.ts',
      'index.js',
      'layout/ContentPane.d.ts',
      'layout/ContentPane.jsx',
      'layout/EditableList.d.ts',
      'layout/EditableList.jsx',
      'layout/ScrollArea.d.ts',
      'layout/ScrollArea.jsx',
    ]);
    expect(files.get('core/FollowButton.d.ts')).toBe(HEADER + fixture('core/FollowButton.d.ts'));
    expect(files.get('layout/EditableList.jsx')).toContain(
      "import { Button } from '../core/Button.jsx';\n",
    );
    expect(files.get('index.js')).toBe(
      HEADER +
        [
          "export { Button } from './core/Button.jsx';",
          "export { ContentPane } from './layout/ContentPane.jsx';",
          "export { EditableList } from './layout/EditableList.jsx';",
          "export { FollowButton } from './core/FollowButton.jsx';",
          "export { ScrollArea } from './layout/ScrollArea.jsx';",
          '',
        ].join('\n'),
    );
    // Button's .d.ts declares only its props, so the index declares the function beside them.
    expect(files.get('index.d.ts')).toBe(
      HEADER +
        [
          "export type { ButtonProps } from './core/Button';",
          "export declare function Button(props: import('./core/Button').ButtonProps): import('react').JSX.Element;",
          "export { ContentPane, type ContentPaneProps } from './layout/ContentPane';",
          "export { EditableList, type EditableListProps, type EditableListRow } from './layout/EditableList';",
          "export { FollowButton, type FollowButtonProps } from './core/FollowButton';",
          "export { ScrollArea, type ScrollAreaProps } from './layout/ScrollArea';",
          '',
        ].join('\n'),
    );
  });
});
