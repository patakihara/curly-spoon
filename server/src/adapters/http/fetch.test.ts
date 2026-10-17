import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AdapterError, type FetchLike, requestJson } from './fetch.js';

/** An upstream that sends its headers and the first bytes of a body, then nothing more. */
function stalling(): { fetch: FetchLike; signals: AbortSignal[]; cancelled: () => boolean } {
  const signals: AbortSignal[] = [];
  let cancelled = false;
  const fetch: FetchLike = async (_url, init) => {
    if (init?.signal) signals.push(init.signal);
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('<rss version="2.0"><channel>'));
      },
      cancel() {
        cancelled = true;
      },
    });
    return new Response(body, { status: 200, headers: { 'content-type': 'application/xml' } });
  };
  return { fetch, signals, cancelled: () => cancelled };
}

describe('an upstream call’s time limit', () => {
  for (const maxBytes of [undefined, 1024]) {
    it(`covers the whole body, not only the headers (byte cap ${maxBytes ?? 'none'})`, async () => {
      const upstream = stalling();
      const call = requestJson(
        upstream.fetch,
        'https://feeds.invalid/a.rss',
        { timeoutMs: 30, maxBytes },
        z.string(),
      );
      await expect(call).rejects.toBeInstanceOf(AdapterError);
      await expect(call).rejects.toMatchObject({ kind: 'timeout', call: 'GET /a.rss' });
      expect(upstream.signals[0]?.aborted).toBe(true);
      expect(upstream.cancelled()).toBe(true);
    });
  }

  it('answers a refusal by its status even when its body is past the byte cap', async () => {
    for (const status of [404, 503]) {
      const fetch: FetchLike = async () =>
        new Response('x'.repeat(2048), { status, headers: { 'content-type': 'text/html' } });
      const failure = await requestJson(
        fetch,
        'https://upstream.invalid/x',
        { maxBytes: 1024 },
        z.string(),
      ).catch((e: unknown) => e);
      expect(failure).toMatchObject({ kind: 'status', status });
    }
  });

  it('still fails a successful answer past the byte cap as a parse error', async () => {
    const fetch: FetchLike = async () => new Response('x'.repeat(2048), { status: 200 });
    const call = requestJson(fetch, 'https://upstream.invalid/x', { maxBytes: 1024 }, z.string());
    await expect(call).rejects.toMatchObject({ kind: 'parse' });
  });

  it('still reads a body that arrives in time', async () => {
    const fetch: FetchLike = async () =>
      new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
    const value = await requestJson(
      fetch,
      'https://upstream.invalid/x',
      { timeoutMs: 1000 },
      z.object({ ok: z.boolean() }),
    );
    expect(value).toEqual({ ok: true });
  });
});
