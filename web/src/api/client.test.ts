import { describe, expect, expectTypeOf, it } from 'vitest';
import { createApiClient, fetchHealth } from './client';

const json = { 'content-type': 'application/json' };

describe('the API client', () => {
  it('reads the health answer through the generated client', async () => {
    const calls: string[] = [];
    const fetch = async (req: Request) => {
      calls.push(req.url);
      return new Response('{"status":"ok"}', { headers: json });
    };
    const client = createApiClient({ baseUrl: 'http://auralis.test', fetch });
    const health = await fetchHealth(client);
    expect(health).toEqual({ status: 'ok' });
    expect(calls).toEqual(['http://auralis.test/health']);
    expectTypeOf(health.status).toEqualTypeOf<'ok'>();
  });

  it('fails when the server does not answer ok', async () => {
    const fetch = async () => new Response('{"error":"x"}', { status: 503, headers: json });
    const client = createApiClient({ baseUrl: 'http://auralis.test', fetch });
    await expect(fetchHealth(client)).rejects.toThrow('503');
  });
});
