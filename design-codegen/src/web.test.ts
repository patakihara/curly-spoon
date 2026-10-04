import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverComponents } from './sonora.js';
import { REPO_ROOT, SONORA_DIR } from './outputs.js';
import { generateWeb, HEADER, rewriteJsx, rewriteShared } from './web.js';

const fixtures = fileURLToPath(new URL('./fixtures/sonora', import.meta.url));
const fixture = (rel: string) => readFileSync(join(fixtures, 'components', rel), 'utf8');
const NS_LINE = "import { NS } from '../shared.js';\n";
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
      .replace("import { NS, sx } from '../shared.js';\n", "import { sx } from '../shared.js';\n")
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

  it('[M0.uikit/a] imports a lookup bound to another name under that name', () => {
    const source = [
      "import React from 'react';",
      NS_LINE.trimEnd(),
      'export function Bar() {',
      '  const DownloadButtonC = NS().DownloadButton;',
      '  return DownloadButtonC;',
      '}',
      '',
    ].join('\n');
    expect(rewriteJsx(source, 'Bar.jsx', known({ DownloadButton: './DownloadButton.jsx' }))).toBe(
      [
        "import React from 'react';",
        "import { DownloadButton as DownloadButtonC } from './DownloadButton.jsx';",
        'export function Bar() {',
        '  return DownloadButtonC;',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('[M0.uikit/a] refuses any other use of NS or the global namespace', () => {
    const whole = [
      "import React from 'react';",
      NS_LINE.trimEnd(),
      'export function X() { const all = NS(); return all.Button; }',
      '',
    ].join('\n');
    expect(() => rewriteJsx(whole, 'X.jsx', known({ Button: './Button.jsx' }))).toThrow(
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
      'shared.js',
    ]);
    expect(files.get('shared.js')).toBe(HEADER + rewriteShared(fixture('shared.js')));
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
    expect(files.get('index.d.ts')).toBe(
      HEADER +
        [
          "export { Button, type ButtonProps } from './core/Button';",
          "export { ContentPane, type ContentPaneProps } from './layout/ContentPane';",
          "export { EditableList, type EditableListProps, type EditableListRow } from './layout/EditableList';",
          "export { FollowButton, type FollowButtonProps } from './core/FollowButton';",
          "export { ScrollArea, type ScrollAreaProps } from './layout/ScrollArea';",
          '',
        ].join('\n'),
    );
  });
});

describe('a .d.ts that declares only the props', () => {
  let tmp: string | undefined;
  afterEach(() => {
    if (tmp !== undefined) rmSync(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it('[M0.uikit/a] gets its function declared beside the props, so a direct .jsx import type-checks', () => {
    const files = generateWeb(discoverComponents(fixtures));
    expect(files.get('core/Button.d.ts')).toBe(
      HEADER +
        fixture('core/Button.d.ts') +
        '\n/** Declared by pnpm gen: Sonora declares only the props. */\n' +
        "export declare function Button(props: ButtonProps): import('react').JSX.Element;\n",
    );

    tmp = mkdtempSync(join(tmpdir(), 'auralis-uikit-direct-'));
    for (const [rel, text] of files) {
      mkdirSync(dirname(join(tmp, rel)), { recursive: true });
      writeFileSync(join(tmp, rel), text);
    }
    const consumer = join(tmp, 'consumer.ts');
    writeFileSync(
      consumer,
      "import { Button } from './core/Button.jsx';\nexport const node = Button({ children: 'Play' });\n",
    );
    const require = createRequire(import.meta.url);
    const reactTypes = join(dirname(require.resolve('@types/react/package.json')), 'index.d.ts');
    const program = ts.createProgram({
      rootNames: [consumer],
      options: {
        noEmit: true,
        strict: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        paths: { react: [reactTypes] },
        types: [],
      },
    });
    const errors = ts
      .getPreEmitDiagnostics(program, program.getSourceFile(consumer))
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    expect(errors).toEqual([]);
  });
});

describe("Sonora's shared helpers in the web package", () => {
  const SHARED = [
    "import React from 'react';",
    '',
    '/** Seconds as `m:ss`. */',
    'export const formatTime = (t) => String(t);',
    '',
    "/** Sonora's namespace. */",
    "export const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};",
    '',
    '/** A fraction held to 0..1. */',
    'export const clamp01 = (v) => Math.min(1, Math.max(0, v));',
    '',
  ].join('\n');

  it('[M0.sonoraclean/e] copies the module without NS and its comment, every other byte kept', () => {
    expect(rewriteShared(SHARED)).toBe(
      [
        "import React from 'react';",
        '',
        '/** Seconds as `m:ss`. */',
        'export const formatTime = (t) => String(t);',
        '',
        '/** A fraction held to 0..1. */',
        'export const clamp01 = (v) => Math.min(1, Math.max(0, v));',
        '',
      ].join('\n'),
    );
  });

  it('[M0.sonoraclean/e] refuses a module that reaches the global namespace other than through NS', () => {
    const sneaky = SHARED + 'export const all = () => window.SonoraDesignSystem_6c1435;\n';
    expect(() => rewriteShared(sneaky)).toThrow(/unsupported use of SonoraDesignSystem_/);
  });

  it("[M0.sonoraclean/e] drops NS from a component's shared import and keeps the other helpers", () => {
    const source = [
      "import React from 'react';",
      "import { NS, activate, sx } from '../shared.js';",
      'export function Row() {',
      '  const Badge = NS().Badge;',
      '  return Badge && sx(activate);',
      '}',
      '',
    ].join('\n');
    expect(rewriteJsx(source, 'Row.jsx', known({ Badge: './Badge.jsx' }))).toBe(
      [
        "import React from 'react';",
        "import { Badge } from './Badge.jsx';",
        "import { activate, sx } from '../shared.js';",
        'export function Row() {',
        '  return Badge && sx(activate);',
        '}',
        '',
      ].join('\n'),
    );
  });

  it("[M0.sonoraclean/e] ships Sonora's shared module once, and every component's helper imports resolve to it", () => {
    const files = generateWeb(discoverComponents(join(REPO_ROOT, SONORA_DIR)));
    const shared = files.get('shared.js')!;
    const sf = ts.createSourceFile('shared.js', shared, ts.ScriptTarget.Latest, true);
    const exported = sf.statements.flatMap((s) =>
      ts.isVariableStatement(s) &&
      ts.getModifiers(s)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        ? s.declarationList.declarations.map((d) => d.name.getText(sf))
        : [],
    );
    expect(exported).not.toContain('NS');
    expect(shared).not.toContain('SonoraDesignSystem_');
    const unresolved: string[] = [];
    for (const [rel, text] of files) {
      if (!rel.endsWith('.jsx')) continue;
      for (const m of text.matchAll(/^import \{([^}]*)\} from '\.\.\/shared\.js';$/gm)) {
        for (const name of m[1]!.split(',').map((n) => n.trim())) {
          if (!exported.includes(name)) unresolved.push(`${rel}: ${name}`);
        }
      }
      expect(text, rel).not.toMatch(/\bNS\b/);
    }
    expect(unresolved).toEqual([]);
  });
});
