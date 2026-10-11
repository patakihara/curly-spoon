/**
 * Opening upstream audio bytes, for every adapter that serves them: the request passes `range`
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

/** An audio file's answer: its status, its parsed headers and its body, still streaming. */
export interface UpstreamFile {
  status: 200 | 206;
  headers: FileHeaders;
  body: ReadableStream<Uint8Array>;
}

const FILE_TIMEOUT_MS = 15_000;

/** Opens `url` with `headers`, passing `range` through, and parses the answer's headers. */
export async function openStream(
  fetch: FetchLike,
  url: string,
  headers: Record<string, string>,
  range: string | undefined,
  schema: ZodType<FileHeaders, z.ZodTypeDef, unknown>,
): Promise<UpstreamFile> {
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
