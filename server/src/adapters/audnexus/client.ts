/**
 * The Audnexus client: an author, and where their photo is
 * (`new AudnexusClient({ baseUrl, fetch, timeoutMs? })`). It is public and takes no key. Its search
 * by name is loose and repeats rows, and one name can have several ASINs (recorded), so an author's
 * ASIN from Audible comes first, and the search answers only those with exactly that name, once each.
 */
import { z } from 'zod';
import { AdapterError, type FetchLike, requestJson } from '../http/fetch.js';
import { stepFailure } from '../http/unavailable.js';
import { audnexusAuthorRowSchema, audnexusAuthorSchema } from './schemas.js';

export const AUDNEXUS_URL = 'https://api.audnex.us';
const AUDNEXUS_LIMIT_MS = 10_000;

export interface AudnexusAuthor {
  asin: string;
  name: string;
  /** The photo's address; null when it has none. */
  imageUrl: string | null;
}

export interface AudnexusClientOptions {
  baseUrl: string;
  fetch: FetchLike;
  timeoutMs?: number;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export class AudnexusClient {
  constructor(private readonly opts: AudnexusClientOptions) {}

  private url(path: string): URL {
    const base = this.opts.baseUrl.endsWith('/') ? this.opts.baseUrl : `${this.opts.baseUrl}/`;
    return new URL(path, base);
  }

  private get limit() {
    return { timeoutMs: this.opts.timeoutMs ?? AUDNEXUS_LIMIT_MS };
  }

  /** The author with this ASIN, or null when it knows none (it answers those with a 4xx). */
  async author(asin: string): Promise<AudnexusAuthor | null> {
    const url = this.url(`authors/${encodeURIComponent(asin)}`);
    try {
      const row = await requestJson(
        this.opts.fetch,
        url.toString(),
        this.limit,
        audnexusAuthorSchema,
      );
      return { asin: row.asin, name: row.name, imageUrl: row.image ? row.image : null };
    } catch (error) {
      if (error instanceof AdapterError && (error.status === 400 || error.status === 404)) {
        return null;
      }
      throw stepFailure('audnexus', error);
    }
  }

  /** The ASINs of authors with exactly this name, each once. */
  async authorsNamed(name: string): Promise<string[]> {
    const url = this.url('authors');
    url.searchParams.set('name', name);
    try {
      const rows = await requestJson(
        this.opts.fetch,
        url.toString(),
        this.limit,
        z.array(audnexusAuthorRowSchema),
      );
      return [...new Set(rows.filter((row) => sameName(row.name, name)).map((row) => row.asin))];
    } catch (error) {
      throw stepFailure('audnexus', error);
    }
  }
}
