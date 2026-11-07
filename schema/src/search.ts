/**
 * Search over the household's library: results ranked by relevance, and suggestions as you type.
 * Every part is an object or a string enum, so both generated clients can carry it. Names and
 * titles are the upstreams' own text; kinds are enums, lengths seconds, dates milliseconds.
 */
import { Availability } from './library.js';
import { ArtUrl, MediaRef } from './play.js';
import { Asin, RequestRef, RequestStatus } from './requests.js';
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
 * epoch), where you stand with it (`owned` means it plays), and whether it is in your own library:
 * a track or an episode by its album or show, a person or a series by what of yours names them.
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
    inYourLibrary: z.boolean(),
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

/** The longest query either route takes, in characters: code points, as `maxLength` counts. */
export const QUERY_MAX = 200;

/**
 * What is typed, trimmed, then up to `QUERY_MAX` characters; an emoji or other letter outside the
 * Basic Multilingual Plane counts as one, though JavaScript's `length` counts it as two.
 */
const queryText = () =>
  z
    .string()
    .trim()
    .refine((q) => [...q].length <= QUERY_MAX)
    .openapi({ maxLength: QUERY_MAX });

/**
 * A book the library lacks, as raw values the apps word themselves: `ref` is what a request for it
 * takes, and `status` where a request for it stands, null while there is none. `progress` runs from
 * 0 to 1 while downloading. A book the household holds is not listed, unless the person's own request
 * brought it, which then says `inLibrary`.
 */
export const SearchBook = z
  .object({
    ref: RequestRef,
    title: z.string(),
    author: z.string().nullable(),
    narrator: z.string().nullable(),
    year: z.number().int().nullable(),
    art: ArtUrl.nullable(),
    status: RequestStatus.nullable(),
    progress: z.number().nullable(),
    /** The library item the person's request became, once it is `inLibrary`. */
    item: MediaRef.nullable(),
  })
  .openapi('SearchBook');
export type SearchBook = z.infer<typeof SearchBook>;

/**
 * A song outside the library that plays straight away: its title, its artists, each name as the
 * upstream gives it, its album where it has one, its length in seconds, and its art.
 */
export const SearchSong = z
  .object({
    ref: MediaRef,
    title: z.string(),
    artists: z.array(z.string()),
    album: z.string().nullable(),
    duration: z.number().nonnegative(),
    art: ArtUrl.nullable(),
    availability: Availability,
  })
  .openapi('SearchSong');
export type SearchSong = z.infer<typeof SearchSong>;

/** Whether songs from outside the library can play right now. */
export const StreamingState = z.enum(['ok', 'unavailable']).openapi('StreamingState');
export type StreamingState = z.infer<typeof StreamingState>;

/** A book row's cover, by its catalogue id. */
export const SearchBookParams = z.object({ asin: Asin });
export type SearchBookParams = z.infer<typeof SearchBookParams>;

/**
 * A search's results, best first, for the query as it was searched, the books the library lacks
 * that the catalogue finds for it, the songs that play straight away, and whether they can now.
 */
export const SearchResults = z
  .object({
    query: z.string(),
    results: z.array(SearchResult),
    books: z.array(SearchBook),
    songs: z.array(SearchSong),
    streaming: StreamingState,
    /** Whether the person has any request, which Search offers whatever it shows. */
    hasRequests: z.boolean(),
  })
  .openapi('SearchResults');
export type SearchResults = z.infer<typeof SearchResults>;

/** Suggestions for what is typed so far, best first. */
export const SuggestionList = z
  .object({
    suggestions: z.array(Suggestion),
    /** Whether the person has any request, which Search offers whatever it shows. */
    hasRequests: z.boolean(),
  })
  .openapi('SuggestionList');
export type SuggestionList = z.infer<typeof SuggestionList>;

/** What is typed so far, trimmed: nothing yet, for recent searches alone. */
export const SuggestQuery = z.object({ q: queryText() });
export type SuggestQuery = z.infer<typeof SuggestQuery>;

/**
 * What to search for, trimmed, and the kinds to keep (`kinds=album&kinds=track`), all when
 * absent. A single `kinds` arrives as one value, not a list, so it is read as a list of one.
 */
export const SearchQuery = z.object({
  q: queryText()
    .refine((q) => q !== '')
    .openapi({ minLength: 1, maxLength: QUERY_MAX }),
  kinds: z
    .preprocess((v) => (typeof v === 'string' ? [v] : v), z.array(SearchKind).min(1))
    .optional(),
});
export type SearchQuery = z.infer<typeof SearchQuery>;
