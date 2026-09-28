/**
 * Sonora's tokens for web and Android. Sonora's own exporter, `export/generate.js`, runs here
 * unchanged, writing into memory; the web CSS and `SonoraTokens.kt` are derived from what it writes.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GENERATED_NOTE, KOTLIN_THEME_PACKAGE } from './outputs.js';

export interface TokenOutputs {
  /** Everything `generate.js` writes, keyed by its path in Sonora, such as `export/web/…`. */
  exported: Map<string, string>;
  /** `web/src/generated/tokens`, by file name. */
  web: Map<string, string>;
  /** The Android theme folder, by file name. */
  kotlin: Map<string, string>;
}

/** The export files the token outputs are derived from. */
const TOKEN_EXPORTS = [
  'export/android/SonoraTokens.kt',
  'export/web/sonora-theme.css',
  'export/web/sonora-tokens.css',
] as const;

type Exporter = (env: {
  readFile: (path: string) => Promise<string>;
  saveFile: (path: string, content: string) => Promise<void>;
  ls: (path: string) => Promise<string[]>;
  log: (line: string) => void;
}) => Promise<void>;

/** Runs `<sonoraDir>/export/generate.js` against `sonoraDir`, keeping what it saves in memory. */
async function runExporter(sonoraDir: string): Promise<Map<string, string>> {
  const source = readFileSync(join(sonoraDir, 'export', 'generate.js'), 'utf8');
  // The way Sonora's export README runs it: the script declares one function and nothing else.
  const generateExport = new Function(`${source}; return generateExport;`)() as Exporter;
  const saved = new Map<string, string>();
  await generateExport({
    readFile: (path) => Promise.resolve(readFileSync(join(sonoraDir, path), 'utf8')),
    saveFile: (path, content) => {
      saved.set(path, content);
      return Promise.resolve();
    },
    ls: (path) => Promise.resolve(readdirSync(join(sonoraDir, path))),
    log: () => undefined,
  });
  return saved;
}

function exported(files: Map<string, string>, path: string): string {
  const text = files.get(path);
  if (text === undefined) throw new Error(`Sonora's export/generate.js did not write ${path}`);
  return text;
}

/**
 * The export leaves the themed colours under `[data-theme="dark"]` and `[data-theme="light"]`
 * only, while Sonora makes dark the default on `:root`. Scoping the dark block to `:root` too
 * gives an unthemed page its dark surfaces, and the light block after it still wins inside
 * `data-theme="light"`.
 */
function darkByDefault(themeCss: string): string {
  const dark = '\n[data-theme="dark"] {\n';
  if (!themeCss.includes(dark))
    throw new Error('sonora-theme.css has no [data-theme="dark"] block');
  return themeCss.replace(dark, '\n:root,\n[data-theme="dark"] {\n');
}

function inAuralisPackage(kotlin: string): string {
  const placeholder = /^package com\.sonora\.design$/m;
  if (!placeholder.test(kotlin))
    throw new Error('SonoraTokens.kt has no package com.sonora.design');
  return `// ${GENERATED_NOTE}\n${kotlin.replace(placeholder, `package ${KOTLIN_THEME_PACKAGE}`)}`;
}

const css = (text: string) => `/* ${GENERATED_NOTE} */\n${text}`;

export async function generateTokens(sonoraDir: string): Promise<TokenOutputs> {
  const files = await runExporter(sonoraDir);
  return {
    exported: files,
    web: new Map([
      ['sonora-tokens.css', css(exported(files, 'export/web/sonora-tokens.css'))],
      ['sonora-theme.css', css(darkByDefault(exported(files, 'export/web/sonora-theme.css')))],
    ]),
    kotlin: new Map([
      ['SonoraTokens.kt', inAuralisPackage(exported(files, 'export/android/SonoraTokens.kt'))],
    ]),
  };
}

/**
 * The token export files Sonora has committed that differ from what `generate.js` writes now:
 * a token changed in `tokens/` without Sonora re-exporting.
 */
export function exportDrift(sonoraDir: string, files: Map<string, string>): string[] {
  return TOKEN_EXPORTS.filter((path) => {
    const committed = join(sonoraDir, path);
    return !existsSync(committed) || readFileSync(committed, 'utf8') !== files.get(path);
  });
}
