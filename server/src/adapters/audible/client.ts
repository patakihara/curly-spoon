/**
 * The Audible catalogue client: the truth about a book, by its ASIN, and the books a search finds
 * (`new AudibleClient({ baseUrl, fetch, timeoutMs? })`). The catalogue is public and takes no key.
 * What it says of a series becomes the `Name #n` form Audiobookshelf's `metadata.json` holds.
 */
import { type FetchLike, requestJson } from '../http/fetch.js';
import { stepFailure } from '../http/unavailable.js';
import { type AudibleProductRow, audibleAnswerSchema, audibleSearchSchema } from './schemas.js';

export const AUDIBLE_URL = 'https://api.audible.com';
/** A book's search runs inside a step's limit, with Prowlarr's own taking most of it. */
const AUDIBLE_LIMIT_MS = 10_000;
const GROUPS = 'contributors,series,product_attrs,product_desc,media';
/** The most books one search lists. */
const SEARCH_ROWS = 10;
/** What Audible sells that is a podcast rather than a book. */
const isPodcast = (row: AudibleProductRow) =>
  row.content_delivery_type?.startsWith('Podcast') === true;

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

/** Audible credits others on the book by their job: "Leslie S. Klinger - editor". */
const NAMED_BY_JOB = /\s-\s\p{Ll}[\p{L} ]*$/u;
const creators = <T extends { name: string }>(rows: T[] | null | undefined): T[] =>
  (rows ?? []).filter(({ name }) => !NAMED_BY_JOB.test(name));

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
    authors: creators(row.authors).map(({ name, asin }) => ({ name, asin: asin ?? null })),
    narrators: creators(row.narrators).map(({ name }) => name),
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

  private url(path: string): URL {
    const base = this.opts.baseUrl.endsWith('/') ? this.opts.baseUrl : `${this.opts.baseUrl}/`;
    return new URL(path, base);
  }

  /** The books a search finds, the catalogue's best first, within `timeoutMs` when given. */
  async search(keywords: string, timeoutMs?: number): Promise<AudibleProduct[]> {
    const url = this.url('1.0/catalog/products');
    url.searchParams.set('keywords', keywords);
    url.searchParams.set('num_results', String(SEARCH_ROWS));
    url.searchParams.set('products_sort_by', 'Relevance');
    url.searchParams.set('response_groups', GROUPS);
    try {
      const { products } = await requestJson(
        this.opts.fetch,
        url.toString(),
        { timeoutMs: timeoutMs ?? this.opts.timeoutMs ?? AUDIBLE_LIMIT_MS },
        audibleSearchSchema,
      );
      return products.flatMap((row) => {
        const product = isPodcast(row) ? null : toProduct(row);
        return product === null ? [] : [product];
      });
    } catch (error) {
      throw stepFailure('audible', error);
    }
  }

  /** The product with this ASIN, or null when the catalogue does not know it. */
  async product(asin: string): Promise<AudibleProduct | null> {
    const url = this.url(`1.0/catalog/products/${encodeURIComponent(asin)}`);
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
