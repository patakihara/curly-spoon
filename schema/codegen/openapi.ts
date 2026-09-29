import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import type { z } from 'zod';
import { SESSION_COOKIE } from '../src/auth.js';
import type { Route } from '../src/routes.js';

const SESSION_SCHEME = 'session';
const BEARER_SCHEME = 'bearer';

/**
 * The OpenAPI 3.1 document for these routes; every `.openapi('Name')` schema becomes a component.
 * A route that is not public asks for the session cookie or an app's bearer token, and may answer
 * 401 or 403 with `error`. A route that parses its input may answer 400; a rate-limited one, 429;
 * a streamed one answers audio, 206 to a range and 416 to a range past the end.
 */
export function buildOpenApiDocument(
  routes: readonly Route[],
  error: z.ZodTypeAny,
): ReturnType<OpenApiGeneratorV31['generateDocument']> {
  const registry = new OpenAPIRegistry();
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
    registry.registerPath({
      method: route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete',
      path: route.path,
      operationId: route.operationId,
      summary: route.summary,
      ...(Object.keys(request).length === 0 ? {} : { request }),
      ...(signedIn ? { security: [{ [SESSION_SCHEME]: [] }, { [BEARER_SCHEME]: [] }] } : {}),
      responses: {
        ...(route.redirect
          ? {
              302: {
                description: route.responseDescription,
                headers: { Location: { schema: { type: 'string' } } },
              },
            }
          : route.stream
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
        ...(route.stream
          ? { 416: { description: 'The range starts past the end of the file.' } }
          : {}),
      },
    });
  }
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'Auralis API', version: '0.0.0' },
  });
}
