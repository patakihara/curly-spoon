import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import type { Route } from '../src/routes.js';

/** The OpenAPI 3.1 document for these routes; every `.openapi('Name')` schema becomes a component. */
export function buildOpenApiDocument(
  routes: readonly Route[],
): ReturnType<OpenApiGeneratorV31['generateDocument']> {
  const registry = new OpenAPIRegistry();
  for (const route of routes) {
    registry.registerPath({
      method: route.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete',
      path: route.path,
      operationId: route.operationId,
      summary: route.summary,
      responses: {
        200: {
          description: route.responseDescription,
          content: { 'application/json': { schema: route.response } },
        },
      },
    });
  }
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'Auralis API', version: '0.0.0' },
  });
}
