/**
 * One recorded upstream call: the scrubbed request and the answer mediaserver gave. Stored as
 * `adapters/<upstream>/recordings/<call>.json`, keys in this order, with no timestamp, so a
 * re-record diffs only when the upstream really changed.
 */
import { z } from 'zod';

/**
 * A file committed beside the recording that stands in for a binary body: the real body (a
 * household audio file) is never kept. `synthesized` says what the file is instead.
 */
export const bytesBodySchema = z
  .object({
    bytes: z.string().regex(/^[\w-]+\.[a-z0-9]+$/, 'a plain file name beside the recording'),
    synthesized: z.string().min(1),
  })
  .strict();
export type BytesBody = z.infer<typeof bytesBodySchema>;

/**
 * `null` for no body, `{json}` for a JSON body, `{text}` for anything else textual (an HLS
 * playlist), `{bytes}` for an audio file's body, served from a committed stand-in.
 */
export const recordedBodySchema = z.union([
  z.null(),
  z.object({ json: z.unknown() }).strict(),
  z.object({ text: z.string() }).strict(),
  bytesBodySchema,
]);
export type RecordedBody = z.infer<typeof recordedBodySchema>;

export const recordingSchema = z
  .object({
    upstream: z.string().min(1),
    upstreamVersion: z.string().min(1),
    call: z.string().min(1),
    request: z
      .object({
        method: z.string(),
        path: z.string().startsWith('/'),
        query: z.record(z.string()),
        headers: z.record(z.string()),
        body: recordedBodySchema,
      })
      .strict(),
    response: z
      .object({
        status: z.number().int(),
        headers: z.record(z.string()),
        body: recordedBodySchema,
      })
      .strict(),
  })
  .strict();
export type Recording = z.infer<typeof recordingSchema>;

/** The file form: two-space JSON and a final newline. */
export function serializeRecording(r: Recording): string {
  return `${JSON.stringify(r, null, 2)}\n`;
}
