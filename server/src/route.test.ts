import { health, Me, Redirect, SetupBody, type Route } from '@auralis/schema';
import { z } from 'zod';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { Refusal, serve } from './route.js';

const echo = {
  method: 'POST',
  path: '/echo',
  operationId: 'echo',
  summary: 'Echoes a username',
  responseDescription: 'The username.',
  response: Me,
  access: 'admin',
  body: SetupBody,
} as const satisfies Route;

describe('serving a declared route', () => {
  it('answers what the handler returns when it fits the schema', async () => {
    const app = Fastify();
    serve(app, health, () => ({ status: 'ok' as const }));
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('refuses to answer a shape the schema does not describe', async () => {
    const app = Fastify();
    serve(app, health, () => ({ status: 'down' }) as never);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('hands the handler the parsed body, and answers 400 to one that does not fit', async () => {
    const app = Fastify();
    serve(app, echo, (_request, _reply, body) => ({
      username: body.username,
      role: 'member' as const,
    }));
    const ok = await app.inject({ method: 'POST', url: '/echo', payload: { username: 'kara' } });
    expect(ok.json()).toEqual({ username: 'kara', role: 'member' });
    const bad = await app.inject({ method: 'POST', url: '/echo', payload: { username: '' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: 'bad_request' });
    await app.close();
  });

  it('answers a refusal with its status and error', async () => {
    const app = Fastify();
    serve(app, echo, () => {
      throw new Refusal(403, 'wrong_code');
    });
    const res = await app.inject({ method: 'POST', url: '/echo', payload: { username: 'kara' } });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'wrong_code' });
    await app.close();
  });

  it('tags the route with its declared access, where the access hook reads it', async () => {
    const app = Fastify();
    let seen: unknown;
    app.addHook('onRequest', async (request) => {
      seen = request.routeOptions.config.access;
    });
    serve(app, echo, (_request, _reply, body) => ({
      username: body.username,
      role: 'admin' as const,
    }));
    await app.inject({ method: 'POST', url: '/echo', payload: { username: 'kara' } });
    expect(seen).toBe('admin');
    await app.close();
  });

  it('hands the handler parsed path and query parameters, and answers 400 to ones that do not fit', async () => {
    const find = {
      method: 'GET',
      path: '/things/{id}',
      operationId: 'find',
      summary: 'Finds a thing',
      responseDescription: 'The thing.',
      response: z.object({ id: z.string(), n: z.number() }),
      access: 'public',
      params: z.object({ id: z.string().max(3) }),
      query: z.object({ n: z.coerce.number().int() }),
    } as const satisfies Route;
    const app = Fastify();
    serve(app, find, (_request, _reply, _body, input) => ({
      id: input.params.id,
      n: input.query.n,
    }));
    const ok = await app.inject({ method: 'GET', url: '/things/abc?n=4' });
    expect(ok.json()).toEqual({ id: 'abc', n: 4 });
    expect((await app.inject({ method: 'GET', url: '/things/abcd?n=4' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/things/abc?n=x' })).statusCode).toBe(400);
    await app.close();
  });

  it('answers a redirect route with 302 to the location the handler returns', async () => {
    const go = {
      method: 'GET',
      path: '/go',
      operationId: 'go',
      summary: 'Goes',
      responseDescription: 'Sent on.',
      response: Redirect,
      access: 'public',
      redirect: true,
    } as const satisfies Route;
    const app = Fastify();
    serve(app, go, () => ({ location: '/there' }));
    const res = await app.inject({ method: 'GET', url: '/go' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/there');
    await app.close();
  });
});
