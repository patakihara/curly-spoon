/** What the request log keeps: never a sign-in's one-time code or state. */
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
    const log = await logged('/auth/callback?code=one-time-code-1&state=state-value-1');
    expect(log).toContain('/auth/callback');
    expect(log).not.toContain('one-time-code-1');
    expect(log).not.toContain('state-value-1');
  });

  it('leaves out the query of every other /auth route too', async () => {
    const log = await logged('/auth/login?return_to=/private-path&device_id=d-1');
    expect(log).toContain('/auth/login');
    expect(log).not.toContain('private-path');
  });

  it('keeps the query of other routes', async () => {
    expect(await logged('/health?probe=1')).toContain('/health?probe=1');
  });
});
