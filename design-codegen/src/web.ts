/**
 * The web UI package: Sonora's `.jsx` sources with their global-namespace lookups
 * (`NS().CoverArt`) turned into ordinary imports, each beside its `.d.ts` (unchanged, but for the
 * function a props-only `.d.ts` lacks), Sonora's shared helpers module without its `NS`, plus an
 * index of both. A source copy, not a compile: Vite compiles it with the rest of web/.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import ts from 'typescript';
import { GENERATED_NOTE } from './outputs.js';
import type { Component } from './sonora.js';

export const HEADER = `// ${GENERATED_NOTE}\n`;

/** Where a component imports Sonora's shared helpers from, and that module's file name. */
export const SHARED_IMPORT = '../shared.js';
export const SHARED_FILE = 'shared.js';

interface Edit {
  start: number;
  end: number;
  text: string;
}

const isNsCall = (node: ts.Node): node is ts.CallExpression =>
  ts.isCallExpression(node) &&
  ts.isIdentifier(node.expression) &&
  node.expression.text === 'NS' &&
  node.arguments.length === 0;

/** A component taken from NS(), and the local name it is bound to. */
interface Lookup {
  name: string;
  local: string;
}

/** The lookups a declaration makes from NS(), or undefined when it is not an NS lookup. */
function nsLookups(decl: ts.VariableDeclaration): Lookup[] | undefined {
  const init = decl.initializer;
  if (init === undefined) return undefined;
  if (
    ts.isPropertyAccessExpression(init) &&
    isNsCall(init.expression) &&
    ts.isIdentifier(decl.name)
  ) {
    return [{ name: init.name.text, local: decl.name.text }];
  }
  if (isNsCall(init) && ts.isObjectBindingPattern(decl.name)) {
    const names: Lookup[] = [];
    for (const element of decl.name.elements) {
      if (
        element.propertyName !== undefined ||
        element.initializer !== undefined ||
        element.dotDotDotToken !== undefined ||
        !ts.isIdentifier(element.name)
      ) {
        return undefined;
      }
      names.push({ name: element.name.text, local: element.name.text });
    }
    return names;
  }
  return undefined;
}

/** The node's whole line or lines when nothing else shares them, else just the node. */
function lineSpan(source: string, node: ts.Node, sf: ts.SourceFile): Edit {
  let start = node.getStart(sf);
  let end = node.end;
  while (start > 0 && (source[start - 1] === ' ' || source[start - 1] === '\t')) start--;
  if (start > 0 && source[start - 1] !== '\n') return { start: node.getStart(sf), end, text: '' };
  while (source[end] === ' ' || source[end] === '\t') end++;
  if (source[end] === '\n') end++;
  else if (end < source.length) return { start: node.getStart(sf), end: node.end, text: '' };
  return { start, end, text: '' };
}

/**
 * Rewrites one Sonora `.jsx`: drops `NS` from its import of the shared helpers and deletes every
 * `X = NS().X` or `{ A, B } = NS()` declaration (a renamed `Y = NS().X` imports `X as Y`), and
 * imports each name after `import React`. `importPath` gives the relative path to a component's
 * `.jsx`, or undefined for a name no component exports. Every other byte is Sonora's. Any other
 * use of NS or the global namespace is refused.
 */
export function rewriteJsx(
  source: string,
  file: string,
  importPath: (name: string) => string | undefined,
): string {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const edits: Edit[] = [];
  const removed = new Set<ts.Node>();
  const lookups = new Map<string, string>();

  for (const statement of sf.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== SHARED_IMPORT
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) {
      throw new Error(`${file}: unsupported import from ${SHARED_IMPORT}`);
    }
    const ns = bindings.elements.find((e) => e.name.text === 'NS');
    if (ns === undefined) continue;
    if (ns.propertyName !== undefined) throw new Error(`${file}: unsupported NS() use`);
    removed.add(ns);
    const kept = bindings.elements.filter((e) => e !== ns);
    edits.push(
      kept.length === 0
        ? lineSpan(source, statement, sf)
        : {
            start: bindings.getStart(sf),
            end: bindings.end,
            text: `{ ${kept.map((e) => e.getText(sf)).join(', ')} }`,
          },
    );
  }

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclarationList(node)) {
      const decls = node.declarations;
      const found = decls.map(nsLookups);
      if (found.some((l) => l !== undefined)) {
        for (const [i, lookup] of found.entries()) {
          if (lookup === undefined) continue;
          for (const { name, local } of lookup) {
            const bound = lookups.get(local);
            if (bound !== undefined && bound !== name) {
              throw new Error(`${file}: ${local} is bound to both NS().${bound} and NS().${name}`);
            }
            lookups.set(local, name);
          }
          removed.add(decls[i]!);
        }
        const kept = decls.filter((_, i) => found[i] === undefined);
        if (kept.length === 0) {
          if (!ts.isVariableStatement(node.parent))
            throw new Error(`${file}: unsupported NS() use`);
          edits.push(lineSpan(source, node.parent, sf));
        } else {
          edits.push({
            start: decls[0]!.getStart(sf),
            end: decls[decls.length - 1]!.end,
            text: kept.map((d) => d.getText(sf)).join(', '),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  const check = (node: ts.Node): void => {
    if (removed.has(node)) return;
    if (ts.isIdentifier(node) && node.text === 'NS') {
      throw new Error(`${file}: unsupported NS() use at ${node.parent.getText(sf)}`);
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text.startsWith('SonoraDesignSystem_')) {
      throw new Error(
        `${file}: unsupported use of window.SonoraDesignSystem_ at ${node.getText(sf)}`,
      );
    }
    ts.forEachChild(node, check);
  };
  check(sf);

  const imported = new Set<string>();
  let react: ts.ImportDeclaration | undefined;
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const clause = statement.importClause;
    if (
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === 'react' &&
      clause?.name !== undefined
    ) {
      react = statement;
    }
    const bindings = clause?.namedBindings;
    if (bindings !== undefined && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) imported.add(element.name.text);
    }
  }
  const lines = [...lookups]
    .filter(([local]) => !imported.has(local))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([local, name]) => {
      const path = importPath(name);
      if (path === undefined) throw new Error(`${file}: NS().${name} names no Sonora component`);
      const binding = local === name ? name : `${name} as ${local}`;
      return `\nimport { ${binding} } from '${path}';`;
    });
  if (lines.length > 0) {
    if (react === undefined) throw new Error(`${file}: no \`import React\` to import after`);
    edits.push({ start: react.end, end: react.end, text: lines.join('') });
  }

  let out = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
}

/**
 * Sonora's shared helpers module for the web: every helper but `NS`, which the web package does
 * not need, since its components import each other. `NS` goes with its doc comment; any other use
 * of the global namespace is refused.
 */
export function rewriteShared(source: string, file = SHARED_FILE): string {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const ns = sf.statements.find(
    (s) =>
      ts.isVariableStatement(s) &&
      s.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === 'NS'),
  );
  if (ns === undefined) throw new Error(`${file}: defines no NS`);
  if ((ns as ts.VariableStatement).declarationList.declarations.length !== 1) {
    throw new Error(`${file}: unsupported NS declaration`);
  }
  const span = lineSpan(source, ns, sf);
  const comments = ts.getLeadingCommentRanges(source, ns.getFullStart()) ?? [];
  let start = comments.length > 0 ? comments[0]!.pos : span.start;
  while (start > 0 && source[start - 1] !== '\n') start--;
  // The blank line that set it apart goes with it.
  if (start > 1 && source[start - 1] === '\n' && source[start - 2] === '\n') start--;
  const out = source.slice(0, start) + source.slice(span.end);
  const rest = ts.createSourceFile(file, out, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const check = (node: ts.Node): void => {
    if (
      ts.isIdentifier(node) &&
      (node.text === 'NS' || node.text.startsWith('SonoraDesignSystem_'))
    ) {
      throw new Error(`${file}: unsupported use of ${node.text} at ${node.parent.getText(rest)}`);
    }
    ts.forEachChild(node, check);
  };
  check(rest);
  return out;
}

/** The exported interface and type names of a `.d.ts`, and whether it declares its function. */
function declarationsOf(component: Component, source: string) {
  const sf = ts.createSourceFile(component.dts, source, ts.ScriptTarget.Latest, true);
  const types: string[] = [];
  let hasFunction = false;
  for (const statement of sf.statements) {
    const exported = ts
      .getModifiers(statement as ts.HasModifiers)
      ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      types.push(statement.name.text);
    } else if (ts.isFunctionDeclaration(statement) && statement.name?.text === component.name) {
      hasFunction = true;
    }
  }
  return { types: types.sort(), hasFunction };
}

/**
 * Every file of the web UI package, keyed by its path under the package root. Sonora's shared
 * helpers module, `components/shared.js`, comes along when the components have one.
 */
export function generateWeb(components: Component[]): Map<string, string> {
  const files = new Map<string, string>();
  const shared = components[0] && join(dirname(dirname(components[0].jsx)), SHARED_FILE);
  if (shared !== undefined && existsSync(shared)) {
    files.set(SHARED_FILE, HEADER + rewriteShared(readFileSync(shared, 'utf8')));
  }
  const byName = new Map(components.map((c) => [c.name, c]));
  const js: string[] = [];
  const dts: string[] = [];
  for (const component of components) {
    const { name, folder } = component;
    const importPath = (other: string) => {
      const target = byName.get(other);
      if (target === undefined || other === name) return undefined;
      const dir = posix.relative(folder, target.folder);
      return `${dir === '' ? '.' : dir.startsWith('.') ? dir : `./${dir}`}/${other}.jsx`;
    };
    const jsx = readFileSync(component.jsx, 'utf8');
    files.set(
      `${folder}/${name}.jsx`,
      HEADER + rewriteJsx(jsx, `${folder}/${name}.jsx`, importPath),
    );
    const types = readFileSync(component.dts, 'utf8');
    const declared = declarationsOf(component, types);
    let dtsText = HEADER + types;
    if (!declared.hasFunction) {
      // A few .d.ts files declare only the props; the copy declares the function beside them, so
      // the index and a direct `./X.jsx` import both see it.
      if (!declared.types.includes(`${name}Props`)) {
        throw new Error(`${folder}/${name}.d.ts declares neither ${name} nor ${name}Props`);
      }
      dtsText +=
        `${types.endsWith('\n') ? '' : '\n'}\n/** Declared by pnpm gen: Sonora declares only the props. */\n` +
        `export declare function ${name}(props: ${name}Props): import('react').JSX.Element;\n`;
    }
    files.set(`${folder}/${name}.d.ts`, dtsText);

    const from = `./${folder}/${name}`;
    js.push(`export { ${name} } from '${from}.jsx';`);
    dts.push(
      `export { ${[name, ...declared.types.map((t) => `type ${t}`)].join(', ')} } from '${from}';`,
    );
  }
  files.set('index.js', `${HEADER}${js.join('\n')}\n`);
  files.set('index.d.ts', `${HEADER}${dts.join('\n')}\n`);
  return files;
}
