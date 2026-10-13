/**
 * Search over the household's library: results ranked by relevance, and suggestions as you type.
 * Every part is an object or a string enum, so both generated clients can carry it. Names and
 * titles are the upstreams' own text; kinds are enums, lengths seconds, dates milliseconds.
 */
import { Availability } from './library.js';
import { ArtUrl, MediaRef } from './play.js';
import { z } from './zod.js';

/** What a result is: a song, an album, an artist, a book, an author, a series, a show, an episode. */
export const SearchKind = z
  .enum(['track', 'album', 'artist', 'book', 'author', 'series', 'show', 'episode'])
  .openapi('SearchKind');
export type SearchKind = z.infer<typeof SearchKind>;

/** What a suggestion is: one of the result kinds, or a search you made before. */
export const SuggestionKind = z.enum([...SearchKind.options, 'recent']).openapi('SuggestionKind');
export type SuggestionKind = z.infer<typeof SuggestionKind>;

/** The album a track is on, or the show an episode is from. */
export const SearchParent = z.object({ ref: MediaRef, title: z.string() }).openapi('SearchParent');
export type SearchParent = z.infer<typeof SearchParent>;

/**
 * One result: its kind and title, the people it is by (`creators`, each name as the upstream
 * gives it), its album or show, its art (its own, or its album's or show's; none for a person or
 * a series), its length in seconds, its year, when it was published (milliseconds since the
 * epoch), and where you stand with it.
 */
export const SearchResult = z
  .object({
    ref: MediaRef,
    kind: SearchKind,
    title: z.string(),
    creators: z.array(z.string()),
    parent: SearchParent.nullable(),
    art: ArtUrl.nullable(),
    duration: z.number().nonnegative().nullable(),
    year: z.number().int().nullable(),
    publishedAt: z.number().int().nullable(),
    availability: Availability,
  })
  .openapi('SearchResult');
export type SearchResult = z.infer<typeof SearchResult>;

/**
 * One suggestion: what it is, its text, and the item, person or series it names. A search made
 * before names none.
 */
export const Suggestion = z
  .object({ kind: SuggestionKind, text: z.string(), ref: MediaRef.nullable() })
  .openapi('Suggestion');
export type Suggestion = z.infer<typeof Suggestion>;
