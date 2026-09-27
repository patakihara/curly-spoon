import { health } from '@auralis/schema';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { serve } from './route.js';

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
});
