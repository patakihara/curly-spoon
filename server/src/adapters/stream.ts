/**
 * Opening upstream audio or image bytes, for every adapter that serves them: the request passes `range`
 * through, only the answer's headers are waited for (within the timeout) and parsed, and the body
 * streams on to the caller, who must read or cancel it. Nothing is transcoded or buffered whole.
 */
import { z, type ZodType } from 'zod';
import { AdapterError, type FetchLike } from './http/fetch.js';

/**
 * An audio file's headers, as Audiobookshelf's file route and Jellyfin's static stream both
 * answer a `Range: bytes=0-1` (recorded): an audio type, and ranges served.
 */
export const fileHeadersSchema = z.object({
  'content-type': z.string().regex(/^audio\//i, 'an audio type'),
  'content-length': z.string().regex(/^\d+$/).optional(),
  'content-range': z
    .string()
    .regex(/^bytes (?:\d+-\d+|\*)\/(?:\d+|\*)$/)
    .optional(),
  'accept-ranges': z.string().optional(),
});
export type FileHeaders = z.infer<typeof fileHeadersSchema>;

/**
 * An image's headers, as Audiobookshelf's cover route and Jellyfin's primary image answer
 * (recorded): an image type, and the caching headers a pass-through keeps.
 */
export const imageHeadersSchema = z.object({
  'content-type': z.string().regex(/^image\//i, 'an image type'),
  'content-length': z.string().regex(/^\d+$/).optional(),
  'cache-control': z.string().optional(),
  'last-modified': z.string().optional(),
  etag: z.string().optional(),
});
export type ImageHeaders = z.infer<typeof imageHeadersSchema>;

/** A 416's `Content-Range`, `bytes *` then a slash and the file's size, as that size. */
const unsatisfiedRangeSchema = z.object({
  'content-range': z
    .string()
    .regex(/^bytes \*\/\d+$/)
    .transform((value) => Number(value.slice('bytes */'.length))),
});

/** The upstream's 416 to a range past the end: the file's size, when its answer names it. */
export class RangeNotSatisfiable extends AdapterError {
  constructor(
    call: string,
    readonly size: number | undefined,
  ) {
    super('status', call, 'answered 416', 416);
  }
}

/** A file's answer: its status, its parsed headers and its body, still streaming. */
export interface UpstreamFile<H = FileHeaders> {
  status: 200 | 206;
  headers: H;
  body: ReadableStream<Uint8Array>;
}

const FILE_TIMEOUT_MS = 15_000;

/** Opens `url` with `headers`, passing `range` through, and parses the answer's headers. */
export async function openStream<H = FileHeaders>(
  fetch: FetchLike,
  url: string,
  headers: Record<string, string>,
  range: string | undefined,
  schema: ZodType<H, z.ZodTypeDef, unknown>,
): Promise<UpstreamFile<H>> {
  const call = `GET ${new URL(url).pathname}`;
  const sent: Record<string, string> = { ...headers };
  if (range !== undefined) sent.range = range;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FILE_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { method: 'GET', headers: sent, signal: controller.signal });
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new AdapterError('timeout', call, `no answer in ${FILE_TIMEOUT_MS} ms`, undefined, {
        cause,
      });
    }
    throw new AdapterError('network', call, 'the request failed', undefined, { cause });
  } finally {
    clearTimeout(timer);
  }

  const fail = async (error: AdapterError): Promise<never> => {
    await response.body?.cancel();
    throw error;
  };
  if (response.status === 416) {
    const range = unsatisfiedRangeSchema.safeParse(Object.fromEntries(response.headers.entries()));
    return fail(
      new RangeNotSatisfiable(call, range.success ? range.data['content-range'] : undefined),
    );
  }
  if (!response.ok) {
    return fail(new AdapterError('status', call, `answered ${response.status}`, response.status));
  }
  if ((response.status !== 200 && response.status !== 206) || response.body === null) {
    return fail(new AdapterError('parse', call, `answered ${response.status} with no file`));
  }
  const parsed = schema.safeParse(Object.fromEntries(response.headers.entries()));
  if (!parsed.success) {
    return fail(
      new AdapterError('parse', call, parsed.error.message, response.status, {
        cause: parsed.error,
      }),
    );
  }
  return { status: response.status, headers: parsed.data, body: response.body };
}
