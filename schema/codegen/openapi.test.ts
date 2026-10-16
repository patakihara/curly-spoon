import { describe, expect, it } from 'vitest';
import { constants, ErrorResponse, routes, SESSION_COOKIE, type Route } from '../src/index.js';
import { z } from '../src/zod.js';
import { buildOpenApiDocument } from './openapi.js';

const Greeting = z.object({ name: z.string() }).openapi('Greeting');
const Ok = z.object({ ok: z.boolean() }).openapi('Ok');

const greet = {
  method: 'POST',
  path: '/greet',
  operationId: 'greet',
  summary: 'Greets someone',
  responseDescription: 'Greeted.',
  response: Ok,
  access: 'member',
  body: Greeting,
} as const satisfies Route;

const open = {
  method: 'GET',
  path: '/open',
  operationId: 'open',
  summary: 'Open to anyone',
  responseDescription: 'Answered.',
  response: Ok,
  access: 'public',
} as const satisfies Route;

describe('the OpenAPI document', () => {
  it("describes a route's body as its JSON request body", () => {
    const doc = buildOpenApiDocument([greet], ErrorResponse);
    expect(doc.paths?.['/greet']?.post?.requestBody).toEqual({
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Greeting' } } },
    });
  });

  it('asks for the session cookie or an app bearer token on a signed-in route, with 401 and 403', () => {
    const doc = buildOpenApiDocument([greet, open], ErrorResponse);
    expect(doc.components?.securitySchemes?.['session']).toEqual({
      type: 'apiKey',
      in: 'cookie',
      name: SESSION_COOKIE,
    });
    expect(doc.components?.securitySchemes?.['bearer']).toEqual({ type: 'http', scheme: 'bearer' });
    const post = doc.paths?.['/greet']?.post;
    expect(post?.security).toEqual([{ session: [] }, { bearer: [] }]);
    expect(Object.keys(post?.responses ?? {})).toEqual(['200', '400', '401', '403']);
    const get = doc.paths?.['/open']?.get;
    expect(get?.security).toBeUndefined();
    expect(Object.keys(get?.responses ?? {})).toEqual(['200']);
  });

  it('describes path and query parameters, a redirect, and a rate limit', () => {
    const go = {
      method: 'GET',
      path: '/go/{id}',
      operationId: 'go',
      summary: 'Goes somewhere',
      responseDescription: 'Sent on.',
      response: z.object({ location: z.string() }),
      access: 'public',
      params: z.object({ id: z.string() }),
      query: z.object({ to: z.string().optional() }),
      redirect: true,
      rateLimited: true,
    } as const satisfies Route;
    const get = buildOpenApiDocument([go], ErrorResponse).paths?.['/go/{id}']?.get;
    expect(get?.parameters).toEqual([
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
      { in: 'query', name: 'to', required: false, schema: { type: 'string' } },
    ]);
    expect(Object.keys(get?.responses ?? {})).toEqual(['302', '400', '429']);
    expect(get?.responses?.['302']).toEqual({
      description: 'Sent on.',
      headers: { Location: { schema: { type: 'string' } } },
    });
  });

  it("describes a streamed route's audio answer, whole or a range, and a range past its end", () => {
    const listen = {
      method: 'GET',
      path: '/listen/{id}',
      operationId: 'listen',
      summary: 'Streams a file',
      responseDescription: 'The file.',
      response: z.string().openapi({ format: 'binary' }),
      access: 'member',
      params: z.object({ id: z.string() }),
      stream: 'audio',
    } as const satisfies Route;
    const get = buildOpenApiDocument([listen], ErrorResponse).paths?.['/listen/{id}']?.get;
    expect(Object.keys(get?.responses ?? {})).toEqual(['200', '206', '400', '401', '403', '416']);
    const audio = { 'audio/*': { schema: { type: 'string', format: 'binary' } } };
    expect(get?.responses?.['200']).toEqual({ description: 'The file.', content: audio });
    expect(get?.responses?.['206']).toMatchObject({ content: audio });
    expect(get?.responses?.['416']).toMatchObject({ description: expect.any(String) as unknown });
  });

  it('describes HEAD on a streamed route: the same answers, with no body', () => {
    const listen = {
      method: 'GET',
      path: '/listen/{id}',
      operationId: 'listen',
      summary: 'Streams a file',
      responseDescription: 'The file.',
      response: z.string().openapi({ format: 'binary' }),
      access: 'member',
      params: z.object({ id: z.string() }),
      stream: 'audio',
    } as const satisfies Route;
    const path = buildOpenApiDocument([listen], ErrorResponse).paths?.['/listen/{id}'];
    expect(path?.head?.operationId).toBe('listenHead');
    expect(Object.keys(path?.head?.responses ?? {})).toEqual(
      Object.keys(path?.get?.responses ?? {}),
    );
    expect(path?.head?.responses?.['206']).toEqual({ description: expect.any(String) as unknown });
  });

  it('describes each named constant as a component of its one value', () => {
    const Tone = z.literal('audio/x-tone').openapi('ToneMime');
    const doc = buildOpenApiDocument([open], ErrorResponse, { ToneMime: Tone });
    expect(doc.components?.schemas?.ToneMime).toMatchObject({
      type: 'string',
      const: 'audio/x-tone',
    });
  });

  it('keeps a named schema as it is when a route first reaches it as `.nullable()`, and lets null through where it is asked for', () => {
    const Item = z.object({ id: z.string() }).openapi('Item');
    const Kind = z.enum(['a', 'b']).openapi('Kind');
    const Shelf = z
      .object({
        current: Item.nullable(),
        kind: Kind.nullable(),
        items: z.array(Item),
        first: Kind,
      })
      .openapi('Shelf');
    const doc = buildOpenApiDocument([{ ...open, response: Shelf }], ErrorResponse);
    const schemas = doc.components?.schemas;
    expect(schemas?.Item).toMatchObject({ type: 'object' });
    expect(schemas?.Kind).toMatchObject({ type: 'string' });
    expect(schemas?.Shelf).toMatchObject({
      properties: {
        current: { anyOf: [{ $ref: '#/components/schemas/Item' }, { type: 'null' }] },
        kind: { anyOf: [{ $ref: '#/components/schemas/Kind' }, { type: 'null' }] },
        items: { type: 'array', items: { $ref: '#/components/schemas/Item' } },
        first: { $ref: '#/components/schemas/Kind' },
      },
    });
  });

  it('lets null through a named schema reached as `.nullable()` with a description or a default, and a nullable named union', () => {
    const Item = z.object({ id: z.string() }).openapi('Item');
    const Other = z.object({ name: z.string() }).openapi('Other');
    const Either = z.union([Item, Other]).openapi('Either');
    const Shelf = z
      .object({
        described: Item.nullable().openapi({ description: 'The item, if any.' }),
        defaulted: Item.nullable().default(null),
        either: Either.nullable(),
      })
      .openapi('Shelf');
    const doc = buildOpenApiDocument([{ ...open, response: Shelf }], ErrorResponse);
    const orNull = (name: string) => [{ $ref: `#/components/schemas/${name}` }, { type: 'null' }];

    expect(doc.components?.schemas?.Shelf).toMatchObject({
      properties: {
        described: { anyOf: orNull('Item'), description: 'The item, if any.' },
        defaulted: { anyOf: orNull('Item'), default: null },
        either: { anyOf: orNull('Either') },
      },
    });
    expect(nullRefusingAllOf(doc)).toEqual([]);
  });

  it("holds no `allOf` that asks for null anywhere in the API's document, where null could never pass", () => {
    const doc = buildOpenApiDocument(routes, ErrorResponse, constants);
    expect(nullRefusingAllOf(doc)).toEqual([]);
  });
});

/** Where, in `node`, an `allOf` holds a part that allows null: null never passes every part. */
function nullRefusingAllOf(node: unknown, at = '#'): string[] {
  if (typeof node !== 'object' || node === null) return [];
  const own = Object.entries(node as Record<string, unknown>);
  const here =
    'allOf' in node && Array.isArray(node.allOf) && node.allOf.some(allowsNull) ? [at] : [];
  return [...here, ...own.flatMap(([key, value]) => nullRefusingAllOf(value, `${at}/${key}`))];
}

function allowsNull(schema: unknown): boolean {
  if (typeof schema !== 'object' || schema === null) return false;
  const { type, anyOf, oneOf } = schema as { type?: unknown; anyOf?: unknown; oneOf?: unknown };
  if (type === 'null' || (Array.isArray(type) && type.includes('null'))) return true;
  return [anyOf, oneOf].some((parts) => Array.isArray(parts) && parts.some(allowsNull));
}
