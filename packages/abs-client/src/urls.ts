/**
 * Builders for the two binary endpoints (cover art, audio bytes) the BFF proxies
 * rather than fetching through `AbsClient` directly for JSON — these are handed
 * to the media routes so they can stream from upstream without buffering.
 */

export interface CoverUrlOptions {
  width?: number;
  height?: number;
  format?: 'jpeg' | 'webp' | 'png';
  raw?: boolean;
}

/** `/api/items/:id/cover` relative path, with any requested transform as query params. */
export function buildCoverPath(itemId: string, options: CoverUrlOptions = {}): string {
  const params = new URLSearchParams();
  if (options.width !== undefined) params.set('width', String(options.width));
  if (options.height !== undefined) params.set('height', String(options.height));
  if (options.format !== undefined) params.set('format', options.format);
  if (options.raw !== undefined) params.set('raw', String(options.raw));
  const query = params.toString();
  return `/api/items/${encodeURIComponent(itemId)}/cover${query ? `?${query}` : ''}`;
}

/** `/api/items/:id/file/:fileId` relative path — audio bytes, Range-capable. */
export function buildAudioTrackPath(itemId: string, fileId: string): string {
  return `/api/items/${encodeURIComponent(itemId)}/file/${encodeURIComponent(fileId)}`;
}
