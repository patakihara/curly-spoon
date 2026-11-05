/**
 * The Audible catalogue client: the truth about a book, by its ASIN
 * (`new AudibleClient({ baseUrl, fetch, timeoutMs? })`). The catalogue is public and takes no key.
 * What it says of a series becomes the `Name #n` form Audiobookshelf's `metadata.json` holds.
 */
import { type FetchLike, requestJson } from '../http/fetch.js';
import { stepFailure } from '../http/unavailable.js';
import { type AudibleProductRow, audibleAnswerSchema } from './schemas.js';

export const AUDIBLE_URL = 'https://api.audible.com';
/** A book's search runs inside a step's limit, with Prowlarr's own taking most of it. */
const AUDIBLE_LIMIT_MS = 10_000;
const GROUPS = 'contributors,series,product_attrs,product_desc,media';

export interface AudibleAuthor {
  name: string;
  asin: string | null;
}

export interface AudibleProduct {
  asin: string;
  title: string;
  authors: AudibleAuthor[];
  narrators: string[];
  /** Each as `Name #n`, or `Name` where it gives no place in the series. */
  series: string[];
  runtimeMinutes: number | null;
  year: number | null;
  language: string | null;
  description: string | null;
  imageUrl: string | null;
}

export interface AudibleClientOptions {
  baseUrl: string;
  fetch: FetchLike;
  timeoutMs?: number;
}

/** A title without the edition note that names no part of the book. */
export function cleanTitle(title: string): string {
  return title.replace(/\s*[([]\s*unabridged\s*[)\]]\s*$/i, '').trim();
}

const plainText = (html: string) =>
  html
    .replace(/<[^<>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function toProduct(row: AudibleProductRow): AudibleProduct | null {
  if (!row.title) return null;
  const year = /^\d{4}/.exec(row.release_date ?? '')?.[0];
  return {
    asin: row.asin,
    title: cleanTitle(row.title),
    authors: (row.authors ?? []).map(({ name, asin }) => ({ name, asin: asin ?? null })),
    narrators: (row.narrators ?? []).map(({ name }) => name),
    series: (row.series ?? []).map(({ title, sequence }) =>
      sequence ? `${title} #${sequence}` : title,
    ),
    runtimeMinutes: row.runtime_length_min ?? null,
    year: year === undefined ? null : Number(year),
    language: row.language ?? null,
    description: row.merchandising_summary ? plainText(row.merchandising_summary) : null,
    imageUrl: row.product_images?.['500'] ?? null,
  };
}

export class AudibleClient {
  constructor(private readonly opts: AudibleClientOptions) {}

  /** The product with this ASIN, or null when the catalogue does not know it. */
  async product(asin: string): Promise<AudibleProduct | null> {
    const base = this.opts.baseUrl.endsWith('/') ? this.opts.baseUrl : `${this.opts.baseUrl}/`;
    const url = new URL(`1.0/catalog/products/${encodeURIComponent(asin)}`, base);
    url.searchParams.set('response_groups', GROUPS);
    try {
      const { product } = await requestJson(
        this.opts.fetch,
        url.toString(),
        { timeoutMs: this.opts.timeoutMs ?? AUDIBLE_LIMIT_MS },
        audibleAnswerSchema,
      );
      return toProduct(product);
    } catch (error) {
      throw stepFailure('audible', error);
    }
  }
}
