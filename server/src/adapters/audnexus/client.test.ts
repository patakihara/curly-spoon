import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { StepUnavailable } from '../../requests/steps.js';
import { type FetchLike } from '../http/fetch.js';
import { type Recording, recordingSchema } from '../http/recording.js';
import { replayFetch } from '../http/replay.js';
import { AudnexusClient } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));
const recorded = (call: string): Recording =>
  recordingSchema.parse(JSON.parse(readFileSync(join(here, 'recordings', `${call}.json`), 'utf8')));
const client = (fetch: FetchLike) =>
  new AudnexusClient({ baseUrl: 'http://upstream.invalid', fetch });
const CALLS = ['author-search', 'author-stevenson', 'author-doyle', 'author-missing'];
const replayed = client(replayFetch(CALLS.map(recorded)));
const asinOf = (call: string) => recorded(call).request.path.split('/').pop() as string;

describe('[M3.books] Audnexus', () => {
  it('[M3.books] gives repeated rows once each, and only that exact name', async () => {
    const search = recorded('author-search');
    const rows = (search.response.body as { json: { name: string }[] }).json;
    expect(new Set(rows.map((row) => JSON.stringify(row))).size).toBeLessThan(rows.length);
    const asins = await replayed.authorsNamed(search.request.query.name as string);
    expect(asins.length).toBeGreaterThan(0);
    expect(new Set(asins).size).toBe(asins.length);
    expect(asins).toContain('B0B8V3KRKX');
  });

  it('[M3.books] gives the address of an author’s photo', async () => {
    const author = await replayed.author(asinOf('author-doyle'));
    expect(author).toMatchObject({ name: 'Arthur Conan Doyle' });
    expect(author?.imageUrl).toMatch(/^https:\/\/.*\.jpg$/);
  });

  it('[M3.books] gives no photo for an author with an empty one', async () => {
    expect(await replayed.author(asinOf('author-stevenson'))).toEqual({
      asin: 'B0B8V3KRKX',
      name: 'Robert Louis Stevenson',
      imageUrl: null,
    });
  });

  it('[M3.books] answers nothing for an ASIN it refuses', async () => {
    expect(await replayed.author(asinOf('author-missing'))).toBeNull();
  });

  it('[M3.books] counts as away when it cannot be reached', async () => {
    const refused = client(() => Promise.reject(new Error('refused')));
    await expect(refused.author('B0B8V3KRKX')).rejects.toBeInstanceOf(StepUnavailable);
    await expect(refused.authorsNamed('A Name')).rejects.toBeInstanceOf(StepUnavailable);
  });
});
