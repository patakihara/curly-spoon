/** OpenAPI 3.1 components to kotlinx.serialization data classes. Refuses what it cannot map. */

interface SchemaObject {
  $ref?: string;
  type?: string | string[];
  format?: string;
  enum?: unknown[];
  items?: SchemaObject;
  properties?: Record<string, SchemaObject>;
  required?: string[];
}

export interface OpenApiDocument {
  components?: { schemas?: Record<string, SchemaObject> };
}

const KOTLIN_KEYWORDS = new Set([
  'as',
  'break',
  'class',
  'continue',
  'do',
  'else',
  'false',
  'for',
  'fun',
  'if',
  'in',
  'interface',
  'is',
  'null',
  'object',
  'package',
  'return',
  'super',
  'this',
  'throw',
  'true',
  'try',
  'typealias',
  'typeof',
  'val',
  'var',
  'when',
  'while',
]);
const PROPERTY_NAME = /^[a-z][A-Za-z0-9]*$/;
const TYPE_NAME = /^[A-Z][A-Za-z0-9]*$/;

const pascal = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function enumConstant(value: string, where: string): string {
  const name = value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  if (name === '')
    throw new Error(`${where}: enum value ${JSON.stringify(value)} has no usable name`);
  return /^[0-9]/.test(name) ? `_${name}` : name;
}

function enumClass(name: string, values: unknown[], where: string): string {
  const seen = new Set<string>();
  const lines = values.map((value) => {
    if (typeof value !== 'string') throw new Error(`${where}: only string enums are supported`);
    const constant = enumConstant(value, where);
    if (seen.has(constant)) throw new Error(`${where}: two enum values map to ${constant}`);
    seen.add(constant);
    return `    @SerialName(${JSON.stringify(value)})\n    ${constant},`;
  });
  return `@Serializable\nenum class ${name} {\n${lines.join('\n')}\n}\n`;
}

export function generateKotlin(doc: OpenApiDocument, packageName: string): string {
  const schemas = doc.components?.schemas ?? {};
  const blocks: string[] = [];
  let usesSerialName = false;

  /** The Kotlin type for one schema; an inline enum becomes the class `<Owner><Property>`. */
  function typeOf(
    schema: SchemaObject,
    owner: string,
    where: string,
  ): { type: string; nullable: boolean } {
    if (schema.$ref !== undefined) {
      const name = schema.$ref.replace(/^#\/components\/schemas\//, '');
      if (name === schema.$ref || !(name in schemas)) {
        throw new Error(`${where}: unresolvable $ref ${schema.$ref}`);
      }
      return { type: name, nullable: false };
    }
    const types = Array.isArray(schema.type)
      ? schema.type
      : schema.type === undefined
        ? []
        : [schema.type];
    const nonNull = types.filter((t) => t !== 'null');
    const nullable = nonNull.length !== types.length;
    if (nonNull.length !== 1)
      throw new Error(`${where}: unsupported type ${JSON.stringify(schema.type)}`);
    const [type] = nonNull;
    if (schema.enum !== undefined) {
      if (type !== 'string') throw new Error(`${where}: only string enums are supported`);
      blocks.push(enumClass(owner, schema.enum, where));
      usesSerialName = true;
      return { type: owner, nullable };
    }
    switch (type) {
      case 'string':
        return { type: 'String', nullable };
      case 'boolean':
        return { type: 'Boolean', nullable };
      case 'number':
        return { type: 'Double', nullable };
      case 'integer':
        return { type: schema.format === 'int64' ? 'Long' : 'Int', nullable };
      case 'array': {
        if (schema.items === undefined) throw new Error(`${where}: array without items`);
        const item = typeOf(schema.items, `${owner}Item`, `${where}[]`);
        return { type: `List<${item.type}${item.nullable ? '?' : ''}>`, nullable };
      }
      default:
        throw new Error(`${where}: unsupported type ${JSON.stringify(schema.type)}`);
    }
  }

  for (const name of Object.keys(schemas).sort()) {
    const schema = schemas[name]!;
    if (!TYPE_NAME.test(name)) throw new Error(`${name}: not a Kotlin type name`);
    if (schema.enum !== undefined) {
      if (schema.type !== 'string') throw new Error(`${name}: only string enums are supported`);
      blocks.push(enumClass(name, schema.enum, name));
      usesSerialName = true;
      continue;
    }
    if (schema.type !== 'object' || schema.properties === undefined) {
      throw new Error(`${name}: only objects with properties and string enums are supported`);
    }
    const required = new Set(schema.required ?? []);
    const at = blocks.length;
    const props = Object.entries(schema.properties).map(([prop, propSchema]) => {
      const where = `${name}.${prop}`;
      if (!PROPERTY_NAME.test(prop) || KOTLIN_KEYWORDS.has(prop)) {
        throw new Error(`${where}: not a Kotlin property name`);
      }
      const { type, nullable } = typeOf(propSchema, `${name}${pascal(prop)}`, where);
      if (!required.has(prop)) return `    val ${prop}: ${type}? = null,`;
      return `    val ${prop}: ${type}${nullable ? '?' : ''},`;
    });
    // The class goes before any inline enums its properties just emitted.
    blocks.splice(at, 0, `@Serializable\ndata class ${name}(\n${props.join('\n')}\n)\n`);
  }

  const imports = [
    ...(usesSerialName ? ['import kotlinx.serialization.SerialName'] : []),
    'import kotlinx.serialization.Serializable',
  ];
  return [
    '// Generated by `pnpm gen` from schema/src. Do not edit.',
    `package ${packageName}`,
    '',
    imports.join('\n'),
    '',
    blocks.join('\n'),
  ].join('\n');
}
