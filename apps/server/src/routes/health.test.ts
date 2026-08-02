import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../testSupport/buildTestApp.js';

describe('GET /api/v1/health', () => {
  it('reports ok with upstream unreachable when nothing is configured', async () => {
    const { app } = buildTestApp({ configured: false });
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      upstream: { configured: false, reachable: false },
    });
  });

  it('reports the upstream as reachable when settings point at a live (fake) server', async () => {
    const { app } = buildTestApp({ configured: true });
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.upstream.configured).toBe(true);
    expect(body.upstream.reachable).toBe(true);
    expect(body.upstream.serverVersion).toBe('fake-2.99.0');
  });

  it('is not gated behind auth', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(response.statusCode).toBe(200);
  });
});
