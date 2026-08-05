import { describe, expect, it } from 'vitest';
import { ProviderError, type ProviderFactoryDeps, type ResolvedProviderConfig } from '../types.js';
import {
  createFakeSlskdUpstream,
  FAKE_SLSKD_API_KEY,
  FAKE_SLSKD_BASE_URL,
} from '../../testSupport/fakes/fakeSlskd.js';
import { createSlskdProvider } from './slskd.js';

function config(overrides: Partial<ResolvedProviderConfig> = {}): ResolvedProviderConfig {
  return {
    id: 'slskd',
    kind: 'music',
    enabled: true,
    baseUrl: FAKE_SLSKD_BASE_URL,
    options: {},
    secret: FAKE_SLSKD_API_KEY,
    ...overrides,
  };
}

function makeProvider(
  upstream: ReturnType<typeof createFakeSlskdUpstream>,
  overrides: Partial<ResolvedProviderConfig> = {},
) {
  const deps: ProviderFactoryDeps = { config: config(overrides), fetch: upstream.fetch };
  return createSlskdProvider(deps);
}

async function expectKind(promise: Promise<unknown>, kind: string): Promise<void> {
  try {
    await promise;
    throw new Error('expected promise to reject');
  } catch (err) {
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).kind).toBe(kind);
  }
}

describe('createSlskdProvider: configuration', () => {
  it('throws unauthorized before any network call when unconfigured', async () => {
    const upstream = createFakeSlskdUpstream();
    const provider = makeProvider(upstream, { baseUrl: null, secret: null });
    await expectKind(provider.search({ term: 'anything' }), 'unauthorized');
  });

  it('throws unauthorized when slskd rejects the API key', async () => {
    const upstream = createFakeSlskdUpstream();
    const provider = makeProvider(upstream, { secret: 'wrong-key' });
    await expectKind(provider.testConnection(), 'unauthorized');
  });
});

describe('createSlskdProvider: search', () => {
  it('polls until the search reports Completed, then reads back its responses', async () => {
    const upstream = createFakeSlskdUpstream();
    upstream.setNextSearch(
      [
        {
          username: 'peer-a',
          hasFreeUploadSlot: true,
          queueLength: 0,
          uploadSpeed: 500,
          files: [
            {
              filename: 'Music\\Aurora\\Nightfall\\03 - Drifting.flac',
              size: 42_000_000,
              bitRate: 900,
              extension: 'flac',
            },
          ],
        },
      ],
      // Two incomplete polls before it flips to Completed — exercises the poll loop, not
      // just its terminal read.
      2,
    );

    const provider = makeProvider(upstream);
    const results = await provider.search({ term: 'drifting' });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      providerId: 'slskd',
      sourceName: 'peer-a',
      title: '03 - Drifting',
      artist: 'Aurora',
      album: 'Nightfall',
      sizeBytes: 42_000_000,
      bitrateKbps: 900,
      format: 'flac',
    });
  });

  it('degrades to an empty array rather than throwing when nothing matches', async () => {
    const upstream = createFakeSlskdUpstream();
    upstream.setNextSearch([]);
    const provider = makeProvider(upstream);
    await expect(provider.search({ term: 'nothing-like-this-exists' })).resolves.toEqual([]);
  });

  it('ranks a peer with a free upload slot and a shorter queue ahead of one without', async () => {
    const upstream = createFakeSlskdUpstream();
    upstream.setNextSearch([
      {
        username: 'slow-peer',
        hasFreeUploadSlot: false,
        queueLength: 40,
        uploadSpeed: 100,
        files: [{ filename: 'song.mp3', size: 1000 }],
      },
      {
        username: 'fast-peer',
        hasFreeUploadSlot: true,
        queueLength: 0,
        uploadSpeed: 100,
        files: [{ filename: 'song.mp3', size: 1000 }],
      },
    ]);
    const provider = makeProvider(upstream);
    const results = await provider.search({ term: 'song' });
    expect(results.map((r) => r.sourceName)).toEqual(['fast-peer', 'slow-peer']);
  });
});

describe('createSlskdProvider: add / status / remove', () => {
  async function searchOneCandidate(upstream: ReturnType<typeof createFakeSlskdUpstream>) {
    upstream.setNextSearch([
      {
        username: 'peer-a',
        files: [
          { filename: 'Music/Solstice/Reverie/01 - Echo.mp3', size: 5_000_000, bitRate: 320 },
        ],
      },
    ]);
    const provider = makeProvider(upstream);
    const [candidate] = await provider.search({ term: 'echo' });
    if (!candidate) throw new Error('test setup: expected one candidate');
    return { provider, candidate };
  }

  it('enqueues a chosen candidate and returns a handle that status() can read back', async () => {
    const upstream = createFakeSlskdUpstream();
    const { provider, candidate } = await searchOneCandidate(upstream);

    const handle = await provider.add(candidate, { savePath: null, category: null });
    expect(typeof handle).toBe('string');

    const status = await provider.status(handle);
    expect(status.state).toBe('queued');
    expect(status.progress).toBe(0);
  });

  it('sends a relative configured save path through as the batch destination', async () => {
    const upstream = createFakeSlskdUpstream();
    const { provider, candidate } = await searchOneCandidate(upstream);
    // The fake 400s an invalid `destination` (mirroring slskd's own model validation — see
    // its comment), so resolving here proves a *relative* path round-trips successfully.
    await expect(
      provider.add(candidate, { savePath: 'music/incoming', category: null }),
    ).resolves.toEqual(expect.any(String));
  });

  it('rejects an absolute save path locally, before any network call, naming the constraint', async () => {
    const upstream = createFakeSlskdUpstream();
    const { provider, candidate } = await searchOneCandidate(upstream);
    await expectKind(
      provider.add(candidate, { savePath: '/data/music', category: null }),
      'rejected',
    );
  });

  it("rejects a '..' traversal save path locally", async () => {
    const upstream = createFakeSlskdUpstream();
    const { provider, candidate } = await searchOneCandidate(upstream);
    await expectKind(
      provider.add(candidate, { savePath: '../outside', category: null }),
      'rejected',
    );
  });

  it('a save path that reaches slskd invalid anyway (fake-level 400) still maps to rejected', async () => {
    // Exercises the fake's own validation directly, independent of `slskd.ts`'s local
    // check, as a defence against that local check regressing silently.
    const upstream = createFakeSlskdUpstream();
    const response = await upstream.fetch(
      'http://fake.slskd.local/api/v0/transfers/downloads/batches',
      {
        method: 'POST',
        headers: { 'X-API-Key': FAKE_SLSKD_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'peer-a',
          files: [{ filename: 'x.mp3', size: 1 }],
          options: { destination: 'C:\\music' },
        }),
      },
    );
    expect(response.status).toBe(400);
  });

  it('throws rejected when slskd reports the enqueue as failed', async () => {
    const upstream = createFakeSlskdUpstream();
    const { provider, candidate } = await searchOneCandidate(upstream);
    upstream.setNextEnqueueFailure('peer-a', 'user went offline');
    await expectKind(provider.add(candidate, { savePath: null, category: null }), 'rejected');
  });

  it('reflects a transfer moving from queued to downloading to completed', async () => {
    const upstream = createFakeSlskdUpstream();
    const { provider, candidate } = await searchOneCandidate(upstream);
    const handle = await provider.add(candidate, { savePath: null, category: null });
    const { id } = JSON.parse(handle) as { username: string; id: string };

    upstream.setTransferState('peer-a', id, {
      state: 'InProgress',
      bytesTransferred: 2_500_000,
      averageSpeed: 500_000,
    });
    const inProgress = await provider.status(handle);
    expect(inProgress.state).toBe('downloading');
    expect(inProgress.progress).toBeCloseTo(0.5);
    expect(inProgress.etaSeconds).toBe(5);

    upstream.setTransferState('peer-a', id, {
      state: 'Completed, Succeeded',
      bytesTransferred: 5_000_000,
    });
    const done = await provider.status(handle);
    expect(done.state).toBe('completed');
    expect(done.progress).toBe(1);
  });

  it('maps a Completed, Errored transfer to state "error" with the upstream exception as the message', async () => {
    const upstream = createFakeSlskdUpstream();
    const { provider, candidate } = await searchOneCandidate(upstream);
    const handle = await provider.add(candidate, { savePath: null, category: null });
    const { id } = JSON.parse(handle) as { username: string; id: string };

    upstream.setTransferState('peer-a', id, {
      state: 'Completed, Errored',
      exception: 'connection reset',
    });
    const status = await provider.status(handle);
    expect(status.state).toBe('error');
    expect(status.errorMessage).toBe('connection reset');
  });

  it('reports state "missing" for a handle slskd has never heard of, without throwing', async () => {
    const upstream = createFakeSlskdUpstream();
    const provider = makeProvider(upstream);
    const status = await provider.status(
      JSON.stringify({ username: 'nobody', id: 'transfer-999' }),
    );
    expect(status.state).toBe('missing');
  });

  it('remove() untracks the transfer; a later status() reports it missing', async () => {
    const upstream = createFakeSlskdUpstream();
    const { provider, candidate } = await searchOneCandidate(upstream);
    const handle = await provider.add(candidate, { savePath: null, category: null });

    await provider.remove(handle, false);
    const status = await provider.status(handle);
    expect(status.state).toBe('missing');
  });

  it('remove() on an already-gone handle is a no-op, not an error', async () => {
    const upstream = createFakeSlskdUpstream();
    const provider = makeProvider(upstream);
    await expect(
      provider.remove(JSON.stringify({ username: 'nobody', id: 'nope' }), true),
    ).resolves.toBeUndefined();
  });

  it('rejects a handle that did not come from this provider, without a network call', async () => {
    const upstream = createFakeSlskdUpstream();
    const provider = makeProvider(upstream);
    await expectKind(provider.status('not-json'), 'rejected');
    await expectKind(provider.status(JSON.stringify({ nope: true })), 'rejected');
  });
});

describe('createSlskdProvider: testConnection', () => {
  it('resolves when the API key is accepted', async () => {
    const upstream = createFakeSlskdUpstream();
    const provider = makeProvider(upstream);
    await expect(provider.testConnection()).resolves.toBeUndefined();
  });
});

describe('createSlskdProvider: never leaks the configured host or key into an error message', () => {
  it('a transport failure names neither the base URL nor the API key', async () => {
    const provider = createSlskdProvider({
      config: config({ baseUrl: 'http://unreachable.slskd.invalid:5030' }),
      fetch: async () => {
        throw new Error('simulated network failure');
      },
    });
    try {
      await provider.testConnection();
      throw new Error('expected testConnection to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
      const message = (err as ProviderError).message;
      expect(message).not.toContain('unreachable.slskd.invalid');
      expect(message).not.toContain(FAKE_SLSKD_API_KEY);
    }
  });
});
