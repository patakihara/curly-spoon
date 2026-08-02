/**
 * HTTP Range support for the fake upstream's audio/cover byte endpoints — this is
 * what makes the BFF's media proxy a pure passthrough rather than something that
 * has to reimplement range slicing itself (see routes/media.ts).
 */

export interface RangeResult {
  status: 200 | 206 | 416;
  headers: Record<string, string>;
  body: Uint8Array | null;
}

function parseRange(rangeHeader: string, total: number): { start: number; end: number } | 'unsatisfiable' {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return 'unsatisfiable';
  const [, startStr, endStr] = match;

  if (startStr === '' && endStr === '') return 'unsatisfiable';

  if (startStr === '') {
    // Suffix range: last N bytes.
    const suffixLength = Number(endStr);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return 'unsatisfiable';
    const start = Math.max(0, total - suffixLength);
    return { start, end: total - 1 };
  }

  const start = Number(startStr);
  const end = endStr === '' ? total - 1 : Number(endStr);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
    return 'unsatisfiable';
  }
  return { start, end: Math.min(end, total - 1) };
}

/** Slice `buffer` per a client `Range` header, matching real Audiobookshelf's single-range behaviour. */
export function serveRangeableBytes(
  buffer: Uint8Array,
  rangeHeader: string | undefined,
  contentType: string,
): RangeResult {
  const total = buffer.length;

  if (!rangeHeader) {
    return {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(total),
        'Accept-Ranges': 'bytes',
      },
      body: buffer,
    };
  }

  const range = parseRange(rangeHeader, total);
  if (range === 'unsatisfiable') {
    return {
      status: 416,
      headers: {
        'Content-Type': contentType,
        'Content-Range': `bytes */${total}`,
        'Accept-Ranges': 'bytes',
      },
      body: null,
    };
  }

  const { start, end } = range;
  const slice = buffer.slice(start, end + 1);
  return {
    status: 206,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(slice.length),
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
    },
    body: slice,
  };
}
