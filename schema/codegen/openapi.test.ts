import { describe, expect, it } from 'vitest';
import { ErrorResponse, SESSION_COOKIE, type Route } from '../src/index.js';
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
      stream: true,
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
      stream: true,
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
});
