import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import type { z } from 'zod';
import { SESSION_COOKIE } from '../src/auth.js';
import type { Route } from '../src/routes.js';

const SECURITY_SCHEME = 'session';

/**
 * The OpenAPI 3.1 document for these routes; every `.openapi('Name')` schema becomes a component.
 * A route that is not public asks for the session cookie and may answer 401 or 403 with `error`.
 */
export function buildOpenApiDocument(
  routes: readonly Route[],
  error: z.ZodTypeAny,
): ReturnType<OpenApiGeneratorV31['generateDocument']> {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', SECURITY_SCHEME, {
    type: 'apiKey',
    in: 'cookie',
    name: SESSION_COOKIE,
  });
  const refusal = (description: string) => ({
    description,
    content: { 'application/json': { schema: error } },
  });
  for (const route of routes) {
    const signedIn = route.access !== 'public';
    registry.registerPath({
      method: route.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete',
      path: route.path,
      operationId: route.operationId,
      summary: route.summary,
      ...(route.body === undefined
        ? {}
        : { request: { body: { content: { 'application/json': { schema: route.body } } } } }),
      ...(signedIn ? { security: [{ [SECURITY_SCHEME]: [] }] } : {}),
      responses: {
        200: {
          description: route.responseDescription,
          content: { 'application/json': { schema: route.response } },
        },
        ...(signedIn
          ? {
              401: refusal('No session.'),
              403: refusal('Without the role this route needs, or sent from another site.'),
            }
          : {}),
      },
    });
  }
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'Auralis API', version: '0.0.0' },
  });
}
