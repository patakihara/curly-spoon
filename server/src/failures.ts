/**
 * How a failure the routes do not answer themselves is answered: always `{ error }`, as a refusal
 * is. A request the framework refuses gets its own status, the code for that status and any
 * headers the status calls for, and is logged at info with why; anything else answers 500
 * `internal`, logged as an error and never described to the client.
 */
import { STATUS_CODES } from 'node:http';
import type { Socket } from 'node:net';
import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from 'fastify';

/**
 * The `{ error }` code for a refused request's status: the status's reason in snake case, as the
 * routes name the same statuses (`bad_request`, `forbidden`, `not_found`,
 * `range_not_satisfiable`).
 */
function refusalCode(status: number): string {
  return (STATUS_CODES[status] ?? 'Bad Request').toLowerCase().replace(/[^a-z]+/g, '_');
}

interface Failure {
  statusCode?: number;
  headers?: Record<string, string>;
}

/** Answers a failure thrown or handed on by a route, a plugin or the framework. */
export function answerFailure(error: Failure, request: FastifyRequest, reply: FastifyReply) {
  const status = error.statusCode ?? 500;
  if (status >= 400 && status < 500) {
    request.log.info({ err: error }, 'request refused');
    return reply
      .code(status)
      .headers(error.headers ?? {})
      .send({ error: refusalCode(status) });
  }
  request.log.error({ err: error }, 'request failed');
  return reply.code(500).send({ error: 'internal' });
}

/**
 * Answers a connection whose request never parsed (headers too large, not HTTP at all) the way
 * Node would, but as `{ error }`, then closes it. A connection already reset gets nothing.
 */
export function refuseConnection(
  log: FastifyBaseLogger,
  error: Error & { code?: string },
  socket: Socket,
) {
  if (error.code === 'ECONNRESET' || socket.destroyed) return;
  const status =
    error.code === 'ERR_HTTP_REQUEST_TIMEOUT'
      ? 408
      : error.code === 'HPE_HEADER_OVERFLOW'
        ? 431
        : 400;
  log.info({ err: error }, 'connection refused');
  if (socket.writable) {
    const body = JSON.stringify({ error: refusalCode(status) });
    socket.write(
      `HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\n` +
        `Content-Type: application/json; charset=utf-8\r\n` +
        `Content-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
    );
  }
  socket.destroy(error);
}
