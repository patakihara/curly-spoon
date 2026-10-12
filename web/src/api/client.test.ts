import { describe, expect, expectTypeOf, it } from 'vitest';
import { createApiClient, fetchHealth } from './client';

const json = { 'content-type': 'application/json' };
const COMMIT = '0123456789abcdef0123456789abcdef01234567';

describe('the API client', () => {
  it('reads the health answer through the generated client', async () => {
    const calls: string[] = [];
    const fetch = async (req: Request) => {
      calls.push(req.url);
      return new Response(`{"status":"ok","commit":"${COMMIT}","signOn":true}`, { headers: json });
    };
    const client = createApiClient({ baseUrl: 'http://auralis.test', fetch });
    const health = await fetchHealth(client);
    expect(health).toEqual({ status: 'ok', commit: COMMIT, signOn: true });
    expect(calls).toEqual(['http://auralis.test/api/health']);
    expectTypeOf(health.status).toEqualTypeOf<'ok'>();
    expectTypeOf(health.commit).toEqualTypeOf<string | null>();
  });

  it('fails when the server does not answer ok', async () => {
    const fetch = async () => new Response('{"error":"x"}', { status: 503, headers: json });
    const client = createApiClient({ baseUrl: 'http://auralis.test', fetch });
    await expect(fetchHealth(client)).rejects.toThrow('503');
  });

  it.each([
    ['a commit that is not a full commit id', '{"status":"ok","commit":"zz"}'],
    ['no commit', '{"status":"ok","signOn":true}'],
    ['no word on a sign-on', `{"status":"ok","commit":"${COMMIT}"}`],
    ['another status', `{"status":"starting","commit":"${COMMIT}"}`],
  ])('refuses a health answer with %s', async (_, body) => {
    const fetch = async () => new Response(body, { headers: json });
    const client = createApiClient({ baseUrl: 'http://auralis.test', fetch });
    await expect(fetchHealth(client)).rejects.toThrow();
  });

  it('reads a null commit, from a server not built into an image', async () => {
    const fetch = async () =>
      new Response('{"status":"ok","commit":null,"signOn":false}', { headers: json });
    const client = createApiClient({ baseUrl: 'http://auralis.test', fetch });
    expect(await fetchHealth(client)).toEqual({ status: 'ok', commit: null, signOn: false });
  });
});
