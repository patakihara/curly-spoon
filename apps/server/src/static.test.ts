/**
 * Exercises `registerStaticServing` directly against a temp directory standing
 * in for `apps/web/dist` — real bytes, real cache headers, real SPA fallback,
 * no dependency on whether an actual web build happens to exist on the machine
 * running the suite (see testSupport/buildTestApp.ts's `serveWeb: false`).
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
import { registerStaticServing } from './static.js';

const baseConfig: AppConfig = {
  port: 0,
  dataDir: ':memory:',
  sessionSecret: 'a'.repeat(32),
  fakeUpstreams: false,
  nodeEnv: 'test',
};

describe('registerStaticServing', () => {
  let distDir: string;

  beforeEach(() => {
    distDir = mkdtempSync(join(tmpdir(), 'auralis-web-dist-'));
    writeFileSync(join(distDir, 'index.html'), '<!doctype html><title>Auralis</title>');
    writeFileSync(join(distDir, 'app.js'), 'console.log("hi")');
  });

  afterEach(() => {
    rmSync(distDir, { recursive: true, force: true });
  });

  async function buildApp(config: AppConfig): Promise<FastifyInstance> {
    const app = fastify({ logger: false });
    await registerStaticServing(app, config);
    await app.ready();
    return app;
  }

  it('serves a real static asset with an immutable cache header', async () => {
    const app = await buildApp({ ...baseConfig, webDistDir: distDir });
    const response = await app.inject({ method: 'GET', url: '/app.js' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('console.log("hi")');
    expect(response.headers['cache-control']).toContain('immutable');
    await app.close();
  });

  it('serves index.html with a no-cache header for an unmatched SPA route', async () => {
    const app = await buildApp({ ...baseConfig, webDistDir: distDir });
    const response = await app.inject({ method: 'GET', url: '/library/lib-books' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Auralis');
    expect(response.headers['cache-control']).toBe('no-cache');
    await app.close();
  });

  it('serves index.html with a no-cache header at the root path', async () => {
    const app = await buildApp({ ...baseConfig, webDistDir: distDir });
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-cache');
    await app.close();
  });

  it('still returns a JSON 404 for an unmatched /api path, not the SPA shell', async () => {
    const app = await buildApp({ ...baseConfig, webDistDir: distDir });
    const response = await app.inject({ method: 'GET', url: '/api/v1/does-not-exist' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { code: 'not_found', message: 'No such route' } });
    await app.close();
  });

  it('falls back to a JSON 404 (not a crash) when no build exists on disk', async () => {
    const app = await buildApp({ ...baseConfig, webDistDir: join(distDir, 'does-not-exist') });
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');
    await app.close();
  });

  it('falls back to a JSON 404 when serveWeb is explicitly disabled, even if a build exists', async () => {
    const app = await buildApp({ ...baseConfig, webDistDir: distDir, serveWeb: false });
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');
    await app.close();
  });
});
