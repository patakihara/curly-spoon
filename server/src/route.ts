import { type Route } from '@auralis/schema';
import { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { type z } from 'zod';

/** Thrown from a handler to answer `{ error }` with a status instead of the route's response. */
export class Refusal extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404,
    readonly error: string,
  ) {
    super(`${status} ${error}`);
  }
}

type BodyOf<R extends Route> = R['body'] extends z.ZodTypeAny ? z.infer<R['body']> : undefined;

/**
 * Serves one declared route. The route's `access` goes into its config, where the access hook
 * reads it. A body is parsed through the route's body schema (400 if it does not fit), and the
 * handler's answer through its response schema, so the server cannot answer a shape the OpenAPI
 * document does not describe.
 */
export function serve<R extends Route>(
  app: FastifyInstance,
  route: R,
  handler: (
    request: FastifyRequest,
    reply: FastifyReply,
    body: BodyOf<R>,
  ) => z.infer<R['response']> | Promise<z.infer<R['response']>>,
): void {
  app.route({
    method: route.method,
    url: route.path,
    config: { access: route.access },
    handler: async (request, reply) => {
      let body: unknown;
      if (route.body !== undefined) {
        const parsed = route.body.safeParse(request.body);
        if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
        body = parsed.data;
      }
      try {
        return route.response.parse(await handler(request, reply, body as BodyOf<R>));
      } catch (err) {
        if (err instanceof Refusal) return reply.code(err.status).send({ error: err.error });
        throw err;
      }
    },
  });
}
