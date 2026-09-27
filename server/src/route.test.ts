import { health, Me, SetupBody, type Route } from '@auralis/schema';
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
});
