import { Readable } from 'node:stream';
import { type ReadableStream as NodeReadableStream } from 'node:stream/web';
import { type Route } from '@auralis/schema';
import { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { type z } from 'zod';

/** Thrown from a handler to answer `{ error }` with a status instead of the route's response. */
export class Refusal extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 416 | 429 | 502,
    readonly error: string,
  ) {
    super(`${status} ${error}`);
  }
}

type Parsed<S> = S extends z.ZodTypeAny ? z.infer<S> : undefined;
type BodyOf<R extends Route> = Parsed<R['body']>;
interface InputOf<R extends Route> {
  params: Parsed<R['params']>;
  query: Parsed<R['query']>;
}

/** `/api/devices/{id}` as Fastify writes it: `/api/devices/:id`. */
function fastifyPath(path: string): string {
  return path.replace(/\{(\w+)\}/g, ':$1');
}

/**
 * Serves one declared route. The route's `access` goes into its config, where the access hook
 * reads it. The body, path parameters and query are parsed through the route's schemas (400 if
 * one does not fit), and the handler's answer through its response schema, so the server cannot
 * answer a shape the OpenAPI document does not describe. A redirect route answers 302.
 */
export function serve<R extends Route>(
  app: FastifyInstance,
  route: R,
  handler: (
    request: FastifyRequest,
    reply: FastifyReply,
    body: BodyOf<R>,
    input: InputOf<R>,
  ) => z.infer<R['response']> | Promise<z.infer<R['response']>>,
): void {
  app.route({
    method: route.method,
    url: fastifyPath(route.path),
    config: { access: route.access },
    handler: async (request, reply) => {
      const parts = [
        ['body', route.body, request.body],
        ['params', route.params, request.params],
        ['query', route.query, request.query],
      ] as const;
      const parsed: Record<string, unknown> = {};
      for (const [name, schema, value] of parts) {
        if (schema === undefined) continue;
        const result = schema.safeParse(value);
        if (!result.success) return reply.code(400).send({ error: 'bad_request' });
        parsed[name] = result.data;
      }
      try {
        const answer = route.response.parse(
          await handler(
            request,
            reply,
            parsed.body as BodyOf<R>,
            {
              params: parsed.params,
              query: parsed.query,
            } as InputOf<R>,
          ),
        );
        if (route.redirect) return reply.redirect((answer as { location: string }).location, 302);
        return answer;
      } catch (err) {
        if (err instanceof Refusal) return reply.code(err.status).send({ error: err.error });
        throw err;
      }
    },
  });
}

/** What a streamed route's handler opens: a status, the headers to pass on, and the body. */
export interface StreamAnswer {
  status: 200 | 206;
  headers: Record<string, string>;
  body: ReadableStream<Uint8Array>;
}

/** One plain `bytes=first-last` range, either end optional but not both: all a player sends. */
const BYTES_RANGE = /^bytes=(?:\d{1,15}-\d{0,15}|-\d{1,15})$/;

/**
 * Serves one declared streamed route at GET and HEAD: path parameters and query parsed as
 * `serve` does, and `Range` checked to be one plain bytes range (400 `bad_range` if not) before
 * the handler sees it. GET sends the handler's stream on as it arrives, never buffered; HEAD
 * sends the same status and headers and cancels the stream unread. A refusal answers `{ error }`.
 */
export function serveStream<R extends Route & { stream: true; method: 'GET' }>(
  app: FastifyInstance,
  route: R,
  handler: (
    request: FastifyRequest,
    input: InputOf<R> & { range: string | undefined },
  ) => Promise<StreamAnswer>,
): void {
  app.route({
    method: ['GET', 'HEAD'],
    url: fastifyPath(route.path),
    exposeHeadRoute: false,
    config: { access: route.access },
    handler: async (request, reply) => {
      const parsed: Record<string, unknown> = {};
      for (const [name, schema, value] of [
        ['params', route.params, request.params],
        ['query', route.query, request.query],
      ] as const) {
        if (schema === undefined) continue;
        const result = schema.safeParse(value);
        if (!result.success) return reply.code(400).send({ error: 'bad_request' });
        parsed[name] = result.data;
      }
      const range = request.headers.range;
      if (range !== undefined && !BYTES_RANGE.test(range)) {
        return reply.code(400).send({ error: 'bad_range' });
      }
      let answer: StreamAnswer;
      try {
        answer = await handler(request, { ...(parsed as unknown as InputOf<R>), range });
      } catch (err) {
        if (err instanceof Refusal) return reply.code(err.status).send({ error: err.error });
        throw err;
      }
      reply.code(answer.status).headers(answer.headers);
      if (request.method === 'HEAD') {
        await answer.body.cancel();
        return reply.send();
      }
      return reply.send(Readable.fromWeb(answer.body as NodeReadableStream<Uint8Array>));
    },
  });
}
