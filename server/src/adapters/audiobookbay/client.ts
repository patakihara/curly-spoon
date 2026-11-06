/**
 * Reads a release's detail page on AudiobookBay, from the address Prowlarr's row gives, so the repo
 * names no domain. A page that cannot be had costs the release its extras, never the search.
 */
import { z } from 'zod';
import type { JobLog } from '../../jobs/schedule.js';
import { type FetchLike, requestJson } from '../http/fetch.js';
import { type DetailExtras, parseDetail } from './parse.js';

/** Pages are read side by side: a book's search must end inside its step's limit. */
const DETAIL_LIMIT_MS = 10_000;
const DETAIL_MAX_BYTES = 4 * 1024 * 1024;

export async function readDetail(
  fetch: FetchLike,
  pageUrl: string,
  log?: JobLog,
): Promise<DetailExtras> {
  try {
    const url = new URL(pageUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return {};
    const page = await requestJson(
      fetch,
      url.toString(),
      { timeoutMs: DETAIL_LIMIT_MS, maxBytes: DETAIL_MAX_BYTES, headers: { accept: 'text/html' } },
      z.string(),
    );
    return parseDetail(page);
  } catch (err) {
    log?.error({ err: err instanceof Error ? err.name : 'unknown' }, 'detail page not read');
    return {};
  }
}
