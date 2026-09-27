import { type Route } from '@auralis/schema';
import { type FastifyInstance, type FastifyRequest } from 'fastify';
import { type z } from 'zod';

/**
 * Serves one declared route. The handler's answer is parsed through the route's response schema
 * on the way out, so the server cannot answer a shape the OpenAPI document does not describe.
 */
export function serve<R extends Route>(
  app: FastifyInstance,
  route: R,
  handler: (request: FastifyRequest) => z.infer<R['response']> | Promise<z.infer<R['response']>>,
): void {
  app.route({
    method: route.method,
    url: route.path,
    handler: async (request) => route.response.parse(await handler(request)),
  });
}
