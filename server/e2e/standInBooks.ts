/**
 * The books Search lists on the recorded server: the real catalogue over a stand-in source, so its
 * limit, its keeping and its covers are what the app runs. The source answers `jekyll stevenson` from
 * the Audible recording. It answers anything else with the words asked as a title with no author,
 * which the library's own titles match, and `Alone in the Stacks`, which fails its first download
 * (`standInMedia.ts`). Asked to be `slow` it never answers, and asked to be `failing` it throws.
 *
 * A test double, for the browser tests only: the image holds none (`recorded.ts` says why).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUDIBLE_URL, AudibleClient, type AudibleProduct } from '../src/adapters/audible/client.js';
import type { Recording } from '../src/adapters/http/recording.js';
import { replayFetch } from '../src/adapters/http/replay.js';
import { type BookCatalogue, bookCatalogue } from '../src/requests/books/catalogue.js';

export type BookSource = 'answers' | 'slow' | 'failing';

const RECORDED_SEARCH = 'jekyll stevenson';

const COVER = join('audnexus', 'recordings', 'author-doyle-image.jpg');

const product = (asin: string, title: string): AudibleProduct => ({
  asin,
  title,
  authors: [],
  narrators: [],
  series: [],
  runtimeMinutes: null,
  year: null,
  language: null,
  description: null,
  imageUrl: null,
});

export function standInBooks(
  source: BookSource,
  recordings: Recording[],
  adapters: string,
): BookCatalogue {
  const recorded = new AudibleClient({ baseUrl: AUDIBLE_URL, fetch: replayFetch(recordings) });
  const quiet = () => undefined;
  return bookCatalogue({
    audible: {
      search: async (keywords, timeoutMs) => {
        if (source === 'slow') return new Promise<AudibleProduct[]>(() => undefined);
        if (source === 'failing') throw new Error('the stand-in source is down');
        if (keywords === RECORDED_SEARCH) return recorded.search(keywords, timeoutMs);
        return [product('B0STANDIN1', keywords), product('B0STANDIN2', 'Alone in the Stacks')];
      },
      product: async () => null,
    },
    fetchArt: async () =>
      new Response(readFileSync(join(adapters, COVER)), {
        headers: { 'content-type': 'image/jpeg' },
      }),
    now: Date.now,
    log: { error: quiet },
  });
}
