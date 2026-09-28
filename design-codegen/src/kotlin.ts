/**
 * The props model as Kotlin: `<Name>Props.kt` per component, holding its data classes, enums and
 * sealed interfaces, and `SonoraEnums.kt` for the enums several components share. Optional props
 * default to null; the real defaults live in the JSX body and the Compose body.
 */
import { enumConstant } from '@auralis/schema/codegen/kotlin';
import { GENERATED_NOTE } from './outputs.js';
import type { ClassDecl, Decl, EnumDecl, KType, Prop, PropsModel, SealedDecl } from './props.js';

const INDENT = '    ';
const pascal = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function typeText(type: KType): string {
  switch (type.kind) {
    case 'string':
      return 'String';
    case 'boolean':
      return 'Boolean';
    case 'float':
      return 'Float';
    case 'any':
      return 'Any';
    case 'unknown':
      return 'Any?';
    case 'rect':
      return 'Rect';
    case 'named':
      return type.args.length === 0
        ? type.name
        : `${type.name}<${type.args.map(typeText).join(', ')}>`;
    case 'typeParam':
      return type.name;
    case 'list':
      return `List<${typeText(type.item)}>`;
    case 'map':
      return `Map<String, ${typeText(type.value)}>`;
    case 'slot':
      return '@Composable () -> Unit';
    case 'fn': {
      const returns = type.returns === 'unit' ? 'Unit' : typeText(type.returns);
      const params = type.params.map(typeText).join(', ');
      return `${type.composable ? '@Composable ' : ''}(${params}) -> ${returns}`;
    }
    case 'nullable': {
      const inner = typeText(type.type);
      return type.type.kind === 'fn' || type.type.kind === 'slot' ? `(${inner})?` : `${inner}?`;
    }
  }
}

const isNullable = (type: KType) => type.kind === 'nullable' || type.kind === 'unknown';

/** Everything a type needs imported. */
function importsOf(type: KType, into: Set<string>): void {
  switch (type.kind) {
    case 'rect':
      into.add('androidx.compose.ui.geometry.Rect');
      return;
    case 'slot':
      into.add('androidx.compose.runtime.Composable');
      return;
    case 'named':
      for (const arg of type.args) importsOf(arg, into);
      return;
    case 'list':
      importsOf(type.item, into);
      return;
    case 'map':
      importsOf(type.value, into);
      return;
    case 'nullable':
      importsOf(type.type, into);
      return;
    case 'fn':
      if (type.composable) into.add('androidx.compose.runtime.Composable');
      for (const param of type.params) importsOf(param, into);
      if (type.returns !== 'unit') importsOf(type.returns, into);
      return;
  }
}

/** A KDoc block; `/*` and `*\/` inside would open or close a comment, so they are escaped. */
function kdoc(text: string | undefined, indent: string): string[] {
  if (text === undefined) return [];
  const safe = text.replace(/\/\*|\*\//g, (m) => (m === '/*' ? '/&#42;' : '*&#47;'));
  const lines = safe.split('\n');
  if (lines.length === 1) return [`${indent}/** ${lines[0]} */`];
  return [
    `${indent}/**`,
    ...lines.map((line) => (line === '' ? `${indent} *` : `${indent} * ${line}`)),
    `${indent} */`,
  ];
}

function propLine(prop: Prop): string[] {
  const type =
    prop.optional && !isNullable(prop.type) ? { kind: 'nullable', type: prop.type } : prop.type;
  const text = typeText(type as KType);
  return [
    ...kdoc(prop.doc, INDENT),
    `${INDENT}val ${prop.name}: ${text}${prop.optional ? ' = null' : ''},`,
  ];
}

function classBlock(decl: ClassDecl): string[] {
  const webOnly = decl.webOnly.length > 0 ? `Web only: ${decl.webOnly.join(', ')}.` : undefined;
  const doc =
    decl.doc !== undefined && webOnly !== undefined
      ? `${decl.doc}\n\n${webOnly}`
      : (decl.doc ?? webOnly);
  const params = decl.typeParams.length > 0 ? `<${decl.typeParams.join(', ')}>` : '';
  return [
    ...kdoc(doc, ''),
    `data class ${decl.name}${params}(`,
    ...decl.props.flatMap(propLine),
    ')',
  ];
}

function enumBlock(decl: EnumDecl): string[] {
  const seen = new Set<string>();
  const entries = decl.values.map((value) => {
    const constant = enumConstant(value, decl.name);
    if (seen.has(constant)) throw new Error(`${decl.name}: two values map to ${constant}`);
    seen.add(constant);
    return `${INDENT}${constant}(${JSON.stringify(value).replace(/\$/g, '\\$')}),`;
  });
  return [`enum class ${decl.name}(val value: String) {`, ...entries, '}'];
}

function sealedBlock(decl: SealedDecl): string[] {
  const members = decl.members.map((member) => {
    const type = typeText(member);
    return [
      `${INDENT}@JvmInline`,
      `${INDENT}value class Of${pascal(type)}(val value: ${type}) : ${decl.name}`,
    ].join('\n');
  });
  return [`sealed interface ${decl.name} {`, members.join('\n\n'), '}'];
}

function block(decl: Decl): string {
  const lines =
    decl.kind === 'class'
      ? classBlock(decl)
      : decl.kind === 'enum'
        ? enumBlock(decl)
        : sealedBlock(decl);
  return `${lines.join('\n')}\n`;
}

function file(decls: Decl[], packageName: string): string {
  const imports = new Set<string>();
  for (const decl of decls) {
    if (decl.kind === 'class') for (const prop of decl.props) importsOf(prop.type, imports);
    if (decl.kind === 'sealed') for (const member of decl.members) importsOf(member, imports);
  }
  const head = [`// ${GENERATED_NOTE}`, `package ${packageName}`, ''];
  if (imports.size > 0) head.push(...[...imports].sort().map((i) => `import ${i}`), '');
  return `${head.join('\n')}\n${decls.map(block).join('\n')}`;
}

/** Every Kotlin file, keyed by file name. */
export function generateKotlin(model: PropsModel, packageName: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const [component, decls] of model.files) {
    files.set(`${component}Props.kt`, file(decls, packageName));
  }
  if (model.shared.length > 0) files.set('SonoraEnums.kt', file(model.shared, packageName));
  return files;
}
