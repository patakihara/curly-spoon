/** Audnexus's answers about authors, as recorded. An author with no photo has an empty `image`. */
import { z } from 'zod';

export const audnexusAuthorRowSchema = z.object({ asin: z.string(), name: z.string() });

export const audnexusAuthorSchema = audnexusAuthorRowSchema.extend({
  image: z.string().nullish(),
});
