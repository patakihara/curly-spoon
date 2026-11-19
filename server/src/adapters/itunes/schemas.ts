/**
 * Zod schemas for iTunes' podcast search (`GET /search?media=podcast&entity=podcast`), cut to what
 * Search reads (checked live, 16 Nov). The answer is JSON sent as `text/javascript`, so it arrives
 * as text and is parsed here. A row may lack `feedUrl` ("history" gave 2 of 25 without one), and
 * then cannot be subscribed to. A row that does not parse is left out; the rest still count.
 */
import { z } from 'zod';

const rowSchema = z.object({
  collectionId: z.number().int().positive(),
  collectionName: z.string().min(1),
  artistName: z.string().optional(),
  feedUrl: z.string().optional(),
  trackCount: z.number().int().nonnegative().optional(),
  artworkUrl600: z.string().optional(),
});
/** One show as iTunes lists it. */
export type ItunesRow = z.infer<typeof rowSchema>;

/** The answer as text or JSON, its rows each parsed alone: a malformed row is dropped. */
export const searchAnswerSchema = z
  .preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return value;
      }
    },
    z.object({ resultCount: z.number().int(), results: z.array(z.unknown()) }),
  )
  .transform(({ results }) =>
    results.flatMap((row) => {
      const parsed = rowSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    }),
  );
