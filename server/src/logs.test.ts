/** What the request log keeps: never a sign-in's one-time code or state, nor what a person searched. */
import { afterEach, describe, expect, it } from 'vitest';
import { type FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { openDatabase } from './store/connection.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function logged(url: string): Promise<string> {
  const lines: string[] = [];
  app = await buildApp({
    webDistDir: null,
    db: openDatabase(':memory:'),
    logger: { stream: { write: (line: string) => lines.push(line) } },
  });
  await app.inject({ url });
  return lines.join('');
}

describe('the request log', () => {
  it('leaves out the query of a sign-in callback, keeping its path', async () => {
    const log = await logged('/api/auth/callback?code=one-time-code-1&state=state-value-1');
    expect(log).toContain('/api/auth/callback');
    expect(log).not.toContain('one-time-code-1');
    expect(log).not.toContain('state-value-1');
  });

  it('leaves out the query of every other /auth route too', async () => {
    const log = await logged('/api/auth/login?return_to=/private-path&device_id=d-1');
    expect(log).toContain('/api/auth/login');
    expect(log).not.toContain('private-path');
  });

  it('[M3.podcasts] leaves out the query of a search, where a pasted feed address can be private', async () => {
    const search = await logged('/api/search?q=http%3a%2f%2f10.0.0.5%2ffeed.xml&kinds=show');
    expect(search).toContain('/api/search?<redacted>');
    expect(search).not.toMatch(/10\.0\.0\.5|kinds/);
    const suggest = await logged('/api/search/suggest?q=http%3a%2f%2f10.0.0.5%2f');
    expect(suggest).toContain('/api/search/suggest?<redacted>');
    expect(suggest).not.toContain('10.0.0.5');
  });

  it('keeps the query of other routes', async () => {
    expect(await logged('/api/health?probe=1')).toContain('/api/health?probe=1');
  });
});
