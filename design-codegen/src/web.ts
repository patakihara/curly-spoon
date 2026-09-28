/**
 * The web UI package: Sonora's `.jsx` sources with their global-namespace lookups
 * (`NS().CoverArt`) turned into ordinary imports, each beside its unchanged `.d.ts`, plus an
 * index of both. A source copy, not a compile: Vite compiles it with the rest of web/.
 */
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import ts from 'typescript';
import { GENERATED_NOTE } from './outputs.js';
import type { Component } from './sonora.js';

export const HEADER = `// ${GENERATED_NOTE}\n`;

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

/** The names a declaration takes from NS(), or undefined when it is not an NS lookup. */
function nsNames(decl: ts.VariableDeclaration): string[] | undefined {
  const init = decl.initializer;
  if (init === undefined) return undefined;
  if (
    ts.isPropertyAccessExpression(init) &&
    isNsCall(init.expression) &&
    ts.isIdentifier(decl.name) &&
    decl.name.text === init.name.text
  ) {
    return [init.name.text];
  }
  if (isNsCall(init) && ts.isObjectBindingPattern(decl.name)) {
    const names: string[] = [];
    for (const element of decl.name.elements) {
      if (
        element.propertyName !== undefined ||
        element.initializer !== undefined ||
        element.dotDotDotToken !== undefined ||
        !ts.isIdentifier(element.name)
      ) {
        return undefined;
      }
      names.push(element.name.text);
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
 * Rewrites one Sonora `.jsx`: deletes the `const NS=…` helper and every `X = NS().X` or
 * `{ A, B } = NS()` declaration, and imports each name after `import React`. `importPath` gives
 * the relative path to a component's `.jsx`, or undefined for a name no component exports.
 * Every other byte is Sonora's. Any other use of NS or the global namespace is refused.
 */
export function rewriteJsx(
  source: string,
  file: string,
  importPath: (name: string) => string | undefined,
): string {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const edits: Edit[] = [];
  const removed = new Set<ts.Node>();
  const names = new Set<string>();

  for (const statement of sf.statements) {
    if (
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some(
        (d) => ts.isIdentifier(d.name) && d.name.text === 'NS',
      )
    ) {
      if (statement.declarationList.declarations.length !== 1) {
        throw new Error(`${file}: unsupported NS() use`);
      }
      edits.push(lineSpan(source, statement, sf));
      removed.add(statement);
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclarationList(node)) {
      const decls = node.declarations;
      const lookups = decls.map(nsNames);
      if (lookups.some((l) => l !== undefined)) {
        for (const [i, lookup] of lookups.entries()) {
          if (lookup === undefined) continue;
          for (const name of lookup) names.add(name);
          removed.add(decls[i]!);
        }
        const kept = decls.filter((_, i) => lookups[i] === undefined);
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
  const lines = [...names]
    .filter((name) => !imported.has(name))
    .sort()
    .map((name) => {
      const path = importPath(name);
      if (path === undefined) throw new Error(`${file}: NS().${name} names no Sonora component`);
      return `\nimport { ${name} } from '${path}';`;
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

/** Every file of the web UI package, keyed by its path under the package root. */
export function generateWeb(components: Component[]): Map<string, string> {
  const files = new Map<string, string>();
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
    files.set(`${folder}/${name}.d.ts`, HEADER + types);

    const from = `./${folder}/${name}`;
    js.push(`export { ${name} } from '${from}.jsx';`);
    const declared = declarationsOf(component, types);
    if (declared.hasFunction) {
      dts.push(
        `export { ${[name, ...declared.types.map((t) => `type ${t}`)].join(', ')} } from '${from}';`,
      );
    } else {
      // A few .d.ts files declare only the props; the index declares the function beside them.
      if (!declared.types.includes(`${name}Props`)) {
        throw new Error(`${folder}/${name}.d.ts declares neither ${name} nor ${name}Props`);
      }
      dts.push(`export type { ${declared.types.join(', ')} } from '${from}';`);
      dts.push(
        `export declare function ${name}(props: import('${from}').${name}Props): import('react').JSX.Element;`,
      );
    }
  }
  files.set('index.js', `${HEADER}${js.join('\n')}\n`);
  files.set('index.d.ts', `${HEADER}${dts.join('\n')}\n`);
  return files;
}
