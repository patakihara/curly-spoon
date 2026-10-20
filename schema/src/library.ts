/**
 * The library as the web shell shows it: the person's books, podcast shows and albums from the
 * library index, each with where they stand with it, and one book, show or album opened. Every
 * part here is an object or a string enum, so both generated clients can carry it: availability
 * is one object with its kind, and the details only that kind has.
 */
import { ArtUrl, MediaRef, MediaRefKey, PlaybackChapter } from './play.js';
import { z } from './zod.js';

/** A share of a whole, from 0 to 1: how far through an item, or a download. */
const Fraction = z.number().min(0).max(1);

/** Which list: books, podcast shows, or music albums. */
export const LibraryMedium = z.enum(['books', 'podcasts', 'music']).openapi('LibraryMedium');
export type LibraryMedium = z.infer<typeof LibraryMedium>;

/** One library list, by its medium, as it sits in a path. */
export const LibraryParams = z.object({ medium: LibraryMedium });
export type LibraryParams = z.infer<typeof LibraryParams>;

/** Where a request stands: made, waiting for a release to be chosen, downloading, or failed. */
export const RequestStatus = z
  .enum(['requested', 'needsChoice', 'downloading', 'failed'])
  .openapi('RequestStatus');
export type RequestStatus = z.infer<typeof RequestStatus>;

/**
 * Where you stand with an item: `owned`, in your library; `streamable`, playing straight away
 * and keepable; `requested`, on its way; or `external`, neither.
 */
export const AvailabilityKind = z
  .enum(['owned', 'streamable', 'requested', 'external'])
  .openapi('AvailabilityKind');
export type AvailabilityKind = z.infer<typeof AvailabilityKind>;

/**
 * Where you stand with an item, on every card and row. A request carries its `status` and, only
 * while it downloads, its `progress`; an external item says whether it is `requestable`. Nothing
 * else carries any of them.
 */
export const Availability = z
  .object({
    kind: AvailabilityKind,
    status: RequestStatus.optional(),
    progress: Fraction.optional(),
    requestable: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const requested = value.kind === 'requested';
    const external = value.kind === 'external';
    const misplaced = (key: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `not on ${value.kind}` });
    if (requested && value.status === undefined) misplaced('status');
    if (!requested && value.status !== undefined) misplaced('status');
    if (value.status !== 'downloading' && value.progress !== undefined) misplaced('progress');
    if (external !== (value.requestable !== undefined)) misplaced('requestable');
  })
  .openapi('Availability');
export type Availability = z.infer<typeof Availability>;

/** What a library list holds: books, podcast shows, or albums. */
export const LibraryEntryKind = z.enum(['book', 'show', 'album']).openapi('LibraryEntryKind');
export type LibraryEntryKind = z.infer<typeof LibraryEntryKind>;

/**
 * One book, show or album in a list: its title, its author, host or artist (`sub`), its art, how
 * far through it you are (null for a show or an album, or one not started), and where you stand
 * with it.
 */
export const LibraryEntry = z
  .object({
    ref: MediaRef,
    kind: LibraryEntryKind,
    title: z.string(),
    sub: z.string().nullable(),
    art: ArtUrl.nullable(),
    progress: Fraction.nullable(),
    availability: Availability,
  })
  .openapi('LibraryEntry');
export type LibraryEntry = z.infer<typeof LibraryEntry>;

/**
 * How a library list is ordered: by title; by `artist`, meaning each list's `sub` (a book's
 * authors, a show's host, an album's artists); or `random`, shuffled by a seed.
 */
export const LibrarySort = z.enum(['title', 'artist', 'random']).openapi('LibrarySort');
export type LibrarySort = z.infer<typeof LibrarySort>;

/** The largest seed: a shuffle's seed is an unsigned 32-bit whole number. */
export const LIBRARY_SEED_MAX = 2 ** 32 - 1;

/** A shuffle's seed, a whole number from 0 to 2^32-1. */
const LibrarySeed = z.number().int().min(0).max(LIBRARY_SEED_MAX);

/**
 * How to order a library list, title when absent, and, for `random`, the seed to shuffle by. A
 * query value arrives as text, so only plain digits read as a seed. The seed is ignored with any
 * other sort, so an address may keep it; with `random` and no seed, the server draws one.
 */
export const LibraryQuery = z.object({
  sort: LibrarySort.default('title'),
  seed: z
    .preprocess((v) => (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v), LibrarySeed)
    .optional(),
});
export type LibraryQuery = z.infer<typeof LibraryQuery>;

/**
 * The signed-in person's books, shows or albums, those in the libraries they may open, in the
 * order asked: the sort used, and the seed it shuffled by, null unless random.
 */
export const LibraryList = z
  .object({ items: z.array(LibraryEntry), sort: LibrarySort, seed: LibrarySeed.nullable() })
  .superRefine((value, ctx) => {
    if ((value.sort === 'random') !== (value.seed !== null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['seed'], message: 'only random has' });
    }
  })
  .openapi('LibraryList');
export type LibraryList = z.infer<typeof LibraryList>;

/** One book, show, episode or album, by its ref as it sits in a path. */
export const ItemParams = z.object({ ref: MediaRefKey });
export type ItemParams = z.infer<typeof ItemParams>;

/**
 * How large art is drawn: `small` in a list's row, `medium` on a card or a page's header, `large`
 * on Now Playing. The upstream scales it down to fit; with no size, art comes as it is stored.
 */
export const ArtSize = z.enum(['small', 'medium', 'large']).openapi('ArtSize');
export type ArtSize = z.infer<typeof ArtSize>;

/** The size art is asked for at, if any. */
export const ArtQuery = z.object({ size: ArtSize.optional() });
export type ArtQuery = z.infer<typeof ArtQuery>;

/** The image bytes the art route answers. */
export const ImageBytes = z.string().openapi({ format: 'binary' });

/**
 * One episode of a show: its description, when it was published (milliseconds since the epoch),
 * its length in seconds, how far through it you are, and whether you finished it.
 */
export const ItemEpisode = z
  .object({
    ref: MediaRef,
    title: z.string(),
    description: z.string().nullable(),
    publishedAt: z.number().int().nullable(),
    duration: z.number().nonnegative().nullable(),
    progress: Fraction.nullable(),
    finished: z.boolean(),
  })
  .openapi('ItemEpisode');
export type ItemEpisode = z.infer<typeof ItemEpisode>;

/** One track of an album: its number on the album, its artist (`sub`), its length in seconds. */
export const ItemTrack = z
  .object({
    ref: MediaRef,
    number: z.number().int().positive().nullable(),
    title: z.string(),
    sub: z.string().nullable(),
    duration: z.number().nonnegative().nullable(),
  })
  .openapi('ItemTrack');
export type ItemTrack = z.infer<typeof ItemTrack>;

/** What an item page shows: a book, a show, one episode of a show, or an album. */
export const ItemKind = z.enum(['book', 'show', 'episode', 'album']).openapi('ItemKind');
export type ItemKind = z.infer<typeof ItemKind>;

/**
 * What only an episode's page has: its show, its notes as the show's feed gives them, when it was
 * published (milliseconds since the epoch), and whether you finished it.
 */
export const ItemEpisodeAbout = z
  .object({
    show: MediaRef,
    description: z.string().nullable(),
    publishedAt: z.number().int().nullable(),
    finished: z.boolean(),
  })
  .openapi('ItemEpisodeAbout');
export type ItemEpisodeAbout = z.infer<typeof ItemEpisodeAbout>;

/**
 * A book, show, episode or album page: its header (title, author, host, show or artist, art, how
 * far through it you are, its length in seconds, where you stand with it), then a book's
 * chapters, a show's episodes in the show's own order, or an album's tracks. The other two lists
 * are empty. An episode's page lists none and carries `episode`; no other page does.
 */
export const ItemDetail = z
  .object({
    ref: MediaRef,
    kind: ItemKind,
    title: z.string(),
    sub: z.string().nullable(),
    art: ArtUrl.nullable(),
    progress: Fraction.nullable(),
    duration: z.number().nonnegative().nullable(),
    availability: Availability,
    chapters: z.array(PlaybackChapter),
    episodes: z.array(ItemEpisode),
    tracks: z.array(ItemTrack),
    episode: ItemEpisodeAbout.optional(),
  })
  .superRefine((value, ctx) => {
    const owner = { chapters: 'book', episodes: 'show', tracks: 'album' } as const;
    for (const [list, kind] of Object.entries(owner) as [keyof typeof owner, ItemKind][]) {
      if (value.kind !== kind && value[list].length > 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [list], message: `only a ${kind} has` });
      }
    }
    if ((value.kind === 'episode') !== (value.episode !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['episode'],
        message: 'only an episode has',
      });
    }
  })
  .openapi('ItemDetail');
export type ItemDetail = z.infer<typeof ItemDetail>;
