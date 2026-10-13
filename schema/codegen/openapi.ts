import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import type { z } from 'zod';
import { SESSION_COOKIE } from '../src/auth.js';
import type { Route } from '../src/routes.js';

const SESSION_SCHEME = 'session';
const BEARER_SCHEME = 'bearer';

const isZod = (value: unknown): value is z.ZodTypeAny =>
  typeof value === 'object' && value !== null && '_def' in value && 'safeParse' in value;

/** The schemas a schema holds: an object's fields, an array's items, what a wrapper wraps. */
function children(schema: z.ZodTypeAny): z.ZodTypeAny[] {
  const def = schema._def as Record<string, unknown>;
  const shape = typeof def.shape === 'function' ? Object.values((def.shape as () => object)()) : [];
  const options = Array.isArray(def.options) ? def.options : [];
  const items = Array.isArray(def.items) ? def.items : [];
  return [
    ...shape,
    ...options,
    ...items,
    def.type,
    def.innerType,
    def.schema,
    def.left,
    def.right,
    def.keyType,
    def.valueType,
  ].filter(isZod);
}

const refIdOf = (schema: z.ZodTypeAny): string | undefined =>
  (schema._def as { openapi?: { _internal?: { refId?: string } } }).openapi?._internal?.refId;

/**
 * The named schemas `schema` reaches as `.nullable()`, by name, each after any such schema it
 * holds. zod-to-openapi 7 makes a component nullable when the first place it meets it is
 * `.nullable()` (and then drops the null where it was asked for); registering these before
 * anything that holds them keeps every component as it is written.
 */
function nullableNamed(
  schema: z.ZodTypeAny,
  found: Map<string, z.ZodTypeAny>,
  seen = new Set<z.ZodTypeAny>(),
) {
  if (seen.has(schema)) return;
  seen.add(schema);
  for (const child of children(schema)) nullableNamed(child, found, seen);
  const def = schema._def as { typeName?: string; innerType?: z.ZodTypeAny };
  const inner = def.typeName === 'ZodNullable' ? def.innerType : undefined;
  const refId = inner === undefined ? undefined : refIdOf(inner);
  if (inner !== undefined && refId !== undefined && !found.has(refId)) found.set(refId, inner);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `{ type: [t, 'null'] }` alone: what zod-to-openapi puts beside a `$ref` for `.nullable()`. */
const isNullCompanion = (value: unknown) =>
  isObject(value) &&
  Object.keys(value).length === 1 &&
  Array.isArray(value.type) &&
  value.type.length === 2 &&
  value.type.includes('null');

/**
 * zod-to-openapi 7 writes a named schema reached as `.nullable()` as
 * `allOf: [{ $ref }, { type: [t, 'null'] }]`, which null never passes: `allOf` needs both, and
 * the component itself is not null. Each, anywhere in `node`, becomes
 * `anyOf: [{ $ref }, { type: 'null' }]`, which says what was meant, in the key's own place.
 */
function letNullThrough(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(letNullThrough);
  if (!isObject(node)) return node;
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => {
      const nullableRef =
        key === 'allOf' &&
        Array.isArray(value) &&
        value.length === 2 &&
        isObject(value[0]) &&
        Object.keys(value[0]).length === 1 &&
        typeof value[0].$ref === 'string' &&
        isNullCompanion(value[1]);
      return nullableRef ? ['anyOf', [value[0], { type: 'null' }]] : [key, letNullThrough(value)];
    }),
  );
}

/**
 * The OpenAPI 3.1 document for these routes; every `.openapi('Name')` schema becomes a component,
 * and so does each of [constants], one literal value both clients name, marked `const`. A named
 * schema reached as `.nullable()` is that schema or null.
 * A route that is not public asks for the session cookie or an app's bearer token, and may answer
 * 401 or 403 with `error`. A route that parses its input may answer 400; a rate-limited one, 429;
 * a streamed audio one answers audio, 206 to a range and 416 to a range past the end; a streamed
 * image one answers the image whole; both answer HEAD with the same answers and no body.
 */
export function buildOpenApiDocument(
  routes: readonly Route[],
  error: z.ZodTypeAny,
  constants: Readonly<Record<string, z.ZodTypeAny>> = {},
): ReturnType<OpenApiGeneratorV31['generateDocument']> {
  const registry = new OpenAPIRegistry();
  for (const [name, schema] of Object.entries(constants)) registry.register(name, schema);
  const components = new Map<string, z.ZodTypeAny>();
  for (const route of routes) {
    for (const schema of [route.params, route.query, route.body, route.response]) {
      if (schema !== undefined) nullableNamed(schema, components);
    }
  }
  for (const [name, schema] of components) {
    if (!(name in constants)) registry.register(name, schema);
  }
  registry.registerComponent('securitySchemes', SESSION_SCHEME, {
    type: 'apiKey',
    in: 'cookie',
    name: SESSION_COOKIE,
  });
  registry.registerComponent('securitySchemes', BEARER_SCHEME, { type: 'http', scheme: 'bearer' });
  const refusal = (description: string) => ({
    description,
    content: { 'application/json': { schema: error } },
  });
  const security: Record<string, string[]>[] = [{ [SESSION_SCHEME]: [] }, { [BEARER_SCHEME]: [] }];
  for (const route of routes) {
    const signedIn = route.access !== 'public';
    const parsesInput =
      route.body !== undefined || route.query !== undefined || route.params !== undefined;
    const request = {
      ...(route.params === undefined ? {} : { params: route.params }),
      ...(route.query === undefined ? {} : { query: route.query }),
      ...(route.body === undefined
        ? {}
        : { body: { content: { 'application/json': { schema: route.body } } } }),
    };
    const responses = {
      ...(route.redirect
        ? {
            302: {
              description: route.responseDescription,
              headers: { Location: { schema: { type: 'string' as const } } },
            },
          }
        : route.stream === 'audio'
          ? {
              200: {
                description: route.responseDescription,
                content: { 'audio/*': { schema: route.response } },
              },
              206: {
                description: 'The range the request asked for.',
                content: { 'audio/*': { schema: route.response } },
              },
            }
          : route.stream === 'image'
            ? {
                200: {
                  description: route.responseDescription,
                  content: { 'image/*': { schema: route.response } },
                },
              }
            : {
                200: {
                  description: route.responseDescription,
                  content: { 'application/json': { schema: route.response } },
                },
              }),
      ...(parsesInput ? { 400: refusal('The request does not parse, or was refused.') } : {}),
      ...(signedIn
        ? {
            401: refusal('No session.'),
            403: refusal('Without the role this route needs, or sent from another site.'),
          }
        : {}),
      ...(route.rateLimited ? { 429: refusal('Too many attempts; see Retry-After.') } : {}),
      ...(route.stream === 'audio'
        ? { 416: { description: 'The range starts past the end of the file.' } }
        : {}),
    };
    const operation = {
      path: route.path,
      summary: route.summary,
      ...(Object.keys(request).length === 0 ? {} : { request }),
      ...(signedIn ? { security } : {}),
    };
    registry.registerPath({
      ...operation,
      method: route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete',
      operationId: route.operationId,
      responses,
    });
    if (route.stream) {
      registry.registerPath({
        ...operation,
        method: 'head',
        operationId: `${route.operationId}Head`,
        responses: Object.fromEntries(
          Object.entries(responses).map(([status, { description }]) => [status, { description }]),
        ),
      });
    }
  }
  const doc = letNullThrough(
    new OpenApiGeneratorV31(registry.definitions).generateDocument({
      openapi: '3.1.0',
      info: { title: 'Auralis API', version: '0.0.0' },
    }),
  ) as ReturnType<OpenApiGeneratorV31['generateDocument']>;
  for (const name of Object.keys(constants)) {
    const schema = doc.components?.schemas?.[name];
    if (!schema || !('enum' in schema) || schema.enum?.length !== 1) {
      throw new Error(`${name}: a constant is one literal value`);
    }
    schema.const = schema.enum[0];
  }
  return doc;
}
