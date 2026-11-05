import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { StepUnavailable } from '../../requests/steps.js';
import { type FetchLike } from '../http/fetch.js';
import { type Recording, recordingSchema } from '../http/recording.js';
import { replayFetch } from '../http/replay.js';
import { AudibleClient, cleanTitle } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));
const recorded = (call: string): Recording =>
  recordingSchema.parse(JSON.parse(readFileSync(join(here, 'recordings', `${call}.json`), 'utf8')));
const client = (fetch: FetchLike) =>
  new AudibleClient({ baseUrl: 'http://upstream.invalid', fetch });
const replayed = client(
  replayFetch(
    ['product-jekyll', 'product-dune', 'product-no-sequence', 'product-missing'].map(recorded),
  ),
);
const asinOf = (call: string) => recorded(call).request.path.split('/').pop() as string;

describe('[M3.books] the Audible catalogue', () => {
  it('[M3.books] reads a book by its ASIN', async () => {
    const product = await replayed.product(asinOf('product-jekyll'));
    expect(product).toMatchObject({
      asin: 'B09J9BJ8DF',
      title: 'The Strange Case of Dr Jekyll and Mr Hyde',
      authors: [{ name: 'Robert Louis Stevenson', asin: 'B0B8V3KRKX' }],
      narrators: ['Paapa Essiedu'],
      series: [],
      runtimeMinutes: 182,
      year: 2021,
      language: 'english',
    });
    expect(product?.description).not.toContain('<');
    expect(product?.imageUrl).toMatch(/^https:\/\/.*\.jpg$/);
  });

  it('[M3.books] gives every series a book is in, with its place', async () => {
    const product = await replayed.product(asinOf('product-dune'));
    expect(product?.series).toEqual(['The Dune Sequence #12', 'Dune #1']);
  });

  it('[M3.books] leaves out a place in a series where it gives none', async () => {
    const product = await replayed.product(asinOf('product-no-sequence'));
    expect(product?.series).toEqual(['Dune', 'The Dune Sequence']);
  });

  it('[M3.books] answers nothing for an ASIN it does not know, which it answers with a 200', async () => {
    expect(await replayed.product(asinOf('product-missing'))).toBeNull();
  });

  it('[M3.books] takes "(Unabridged)" out of a title, and leaves a title that only mentions it', () => {
    expect(cleanTitle('The Stand (Unabridged)')).toBe('The Stand');
    expect(cleanTitle('Frankenstein (The Original 1818 Unabridged and Complete Edition)')).toBe(
      'Frankenstein (The Original 1818 Unabridged and Complete Edition)',
    );
  });

  it('[M3.books] holds a request when it cannot be reached, and on a 5xx', async () => {
    const refused = client(() => Promise.reject(new Error('refused')));
    await expect(refused.product('B09J9BJ8DF')).rejects.toBeInstanceOf(StepUnavailable);
    const broken = client(() => Promise.resolve(new Response('', { status: 503 })));
    await expect(broken.product('B09J9BJ8DF')).rejects.toBeInstanceOf(StepUnavailable);
  });
});
