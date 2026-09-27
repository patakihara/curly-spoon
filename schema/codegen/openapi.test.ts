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

  it('asks for the session cookie on a signed-in route, with 401 and 403 answers', () => {
    const doc = buildOpenApiDocument([greet, open], ErrorResponse);
    expect(doc.components?.securitySchemes?.['session']).toEqual({
      type: 'apiKey',
      in: 'cookie',
      name: SESSION_COOKIE,
    });
    const post = doc.paths?.['/greet']?.post;
    expect(post?.security).toEqual([{ session: [] }]);
    expect(Object.keys(post?.responses ?? {})).toEqual(['200', '401', '403']);
    const get = doc.paths?.['/open']?.get;
    expect(get?.security).toBeUndefined();
    expect(Object.keys(get?.responses ?? {})).toEqual(['200']);
  });
});
