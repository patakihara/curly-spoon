/**
 * One recorded upstream call: the scrubbed request and the answer mediaserver gave. Stored as
 * `adapters/<upstream>/recordings/<call>.json`, keys in this order, with no timestamp, so a
 * re-record diffs only when the upstream really changed.
 */
import { z } from 'zod';

/** `null` for no body, `{json}` for a JSON body, `{text}` for anything else (an HLS playlist). */
export const recordedBodySchema = z.union([
  z.null(),
  z.object({ json: z.unknown() }).strict(),
  z.object({ text: z.string() }).strict(),
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
