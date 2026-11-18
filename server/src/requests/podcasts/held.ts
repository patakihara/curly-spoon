/**
 * The household show a podcast request names, if the index holds it: by its iTunes id, or by its
 * feed address with the scheme, the host's case and a trailing slash ignored.
 */
import type { MediaRef, RequestIds } from '@auralis/schema';
import type { Db } from '../../store/connection.js';

/** A feed address as compared: host and path without a trailing slash, and the query. */
export function feedKey(address: string): string | null {
  try {
    const url = new URL(address);
    return `${url.host}${url.pathname.replace(/\/+$/, '')}${url.search}`;
  } catch {
    return null;
  }
}

export function heldShow(db: Db, ids: RequestIds): MediaRef | null {
  const rows = db
    .prepare(
      `SELECT i.source, i.upstream_id, x.scheme, x.value FROM index_ids x
       JOIN index_items i ON i.source = x.source AND i.upstream_id = x.upstream_id
       WHERE i.kind = 'show' AND x.scheme IN ('itunes_id', 'feed_url')
       ORDER BY i.source, i.upstream_id`,
    )
    .all() as { source: MediaRef['source']; upstream_id: string; scheme: string; value: string }[];
  const feed = ids.feedUrl === undefined ? null : feedKey(ids.feedUrl);
  const found = rows.find(
    ({ scheme, value }) =>
      (scheme === 'itunes_id' && ids.itunesId !== undefined && value === ids.itunesId) ||
      (scheme === 'feed_url' && feed !== null && feedKey(value) === feed),
  );
  return found === undefined ? null : { source: found.source, id: found.upstream_id };
}
