/**
 * Audible's catalogue answer, as recorded. An ASIN it does not know still answers 200, with a
 * product holding nothing but that ASIN, so everything else is optional here.
 */
import { z } from 'zod';

const person = z.object({ name: z.string(), asin: z.string().nullish() });

export const audibleProductSchema = z.object({
  asin: z.string(),
  title: z.string().nullish(),
  authors: z.array(person).nullish(),
  narrators: z.array(person).nullish(),
  series: z.array(z.object({ title: z.string(), sequence: z.string().nullish() })).nullish(),
  runtime_length_min: z.number().nullish(),
  release_date: z.string().nullish(),
  language: z.string().nullish(),
  merchandising_summary: z.string().nullish(),
  product_images: z.record(z.string(), z.string()).nullish(),
});
export type AudibleProductRow = z.infer<typeof audibleProductSchema>;

export const audibleAnswerSchema = z.object({ product: audibleProductSchema });
