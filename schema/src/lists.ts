/**
 * Lists that aren't queues: listening lists of books and shows you tick through, podcast
 * playlists of episodes you pick, music lists of songs in your order, and digests, a rule over
 * shows. The Digest covers every
 * subscription; a custom digest covers the shows you name. A digest holds its shows' unplayed
 * episodes of the last 14 days, oldest or newest first; a playlist leaves out the episodes you
 * played; a listening list crosses off what you finished but keeps it.
 */
import { EpisodeOrder, LibraryEntry } from './library.js';
import { ArtUrl, MediaRef } from './play.js';
import { Revision } from './sessions.js';
import { z } from './zod.js';

/** A share of a whole, from 0 to 1: how far through an item. */
const Fraction = z.number().min(0).max(1);

/** A listening list, a podcast playlist, a digest, or a music list. */
export const ListKind = z.enum(['listening', 'playlist', 'digest', 'music']).openapi('ListKind');
export type ListKind = z.infer<typeof ListKind>;

/** The most entries, or shows, a list holds. */
export const LIST_ENTRIES_MAX = 1000;

/** A list's name: 1 to 200 characters, trimmed. */
const ListName = z.string().trim().min(1).max(200);

/** Entries or shows, at most `LIST_ENTRIES_MAX`; one named twice is kept once, where first named. */
const Refs = z.array(MediaRef).max(LIST_ENTRIES_MAX);

/**
 * What a list's entry is: a book or show on a listening list, an episode, or a song on a music
 * list: a streamed song search or an import named, or a Jellyfin track.
 */
export const ListItemKind = z.enum(['book', 'show', 'episode', 'song']).openapi('ListItemKind');
export type ListItemKind = z.infer<typeof ListItemKind>;

/** The most covers a list's card draws: a 2×2 mosaic. */
export const LIST_COVERS_MAX = 4;

const Count = z.number().int().nonnegative();

/** How many of a list's entries it shows now are books, shows and episodes; songs `count` alone. */
export const ListCounts = z
  .object({ book: Count, show: Count, episode: Count })
  .openapi('ListCounts');
export type ListCounts = z.infer<typeof ListCounts>;

/**
 * One list as your lists show it: its kind, its name, whether it is The Digest, a digest's order
 * (null on any other list), how many entries it shows now and how many of each kind, and the
 * covers its card draws: its entries' art, a digest's its shows', each once, at most
 * `LIST_COVERS_MAX`; and, for a music list imported, the service it came from.
 */
export const ListSummary = z
  .object({
    id: z.string(),
    kind: ListKind,
    name: z.string(),
    theDigest: z.boolean(),
    order: EpisodeOrder.nullable(),
    count: Count,
    counts: ListCounts,
    covers: z.array(ArtUrl).max(LIST_COVERS_MAX),
    /** The service a music list was imported from; null for one made here. */
    importedFrom: z.literal('spotify').nullable(),
  })
  .openapi('ListSummary');
export type ListSummary = z.infer<typeof ListSummary>;

/** Your lists: The Digest first, then the others, oldest first. */
export const ListSummaryList = z.object({ lists: z.array(ListSummary) }).openapi('ListSummaryList');
export type ListSummaryList = z.infer<typeof ListSummaryList>;

/**
 * One entry of a list: its title, its author or host, an episode's show, or a song's artists
 * (`sub`), its art (an episode's is its show's), when an episode was published (milliseconds since
 * the epoch; null on anything else), its length in seconds (null on a show), how far through it
 * you are, and whether you finished it: a book, an episode, or a show whose every episode you
 * finished. A song is never in progress or finished.
 */
export const ListItem = z
  .object({
    ref: MediaRef,
    kind: ListItemKind,
    title: z.string(),
    sub: z.string().nullable(),
    art: ArtUrl.nullable(),
    publishedAt: z.number().int().nullable(),
    duration: z.number().nonnegative().nullable(),
    progress: Fraction.nullable(),
    finished: z.boolean(),
  })
  .openapi('ListItem');
export type ListItem = z.infer<typeof ListItem>;

/** Where an import is: queued or reading the order, matching songs, done, or stopped. */
export const ListImportState = z
  .enum(['reading', 'matching', 'done', 'stopped'])
  .openapi('ListImportState');
export type ListImportState = z.infer<typeof ListImportState>;

/**
 * Why an import stopped: the playlist is gone or private (`playlist_not_found`), Spotify kept
 * refusing (`spotify_unavailable`), or YouTube Music streaming went off (`medium_unavailable`).
 * Running it again goes on from where it stopped.
 */
export const ListImportStop = z
  .enum(['playlist_not_found', 'spotify_unavailable', 'medium_unavailable'])
  .openapi('ListImportStop');
export type ListImportStop = z.infer<typeof ListImportStop>;

/**
 * Why a playlist's entry is not on the list: searched and nothing passed (`noMatch`), an episode
 * or a local file (`notASong`), Spotify has no metadata for it (`unavailable`), or past the most a
 * list holds (`listFull`).
 */
export const UnmatchedReason = z
  .enum(['noMatch', 'notASong', 'unavailable', 'listFull'])
  .openapi('UnmatchedReason');
export type UnmatchedReason = z.infer<typeof UnmatchedReason>;

/** One entry of the playlist left off the list: its place (from 0), why, and what Spotify names. */
export const ListUnmatched = z
  .object({
    position: Count,
    reason: UnmatchedReason,
    title: z.string().nullable(),
    artists: z.array(z.string()),
    album: z.string().nullable(),
    /** Seconds, where Spotify said. */
    duration: z.number().nonnegative().nullable(),
  })
  .openapi('ListUnmatched');
export type ListUnmatched = z.infer<typeof ListUnmatched>;

/**
 * Where a list imported from a Spotify playlist stands: `done` of the playlist's `total` entries
 * read, the entries left off in Spotify's order, how many named a song already on the list
 * (`duplicates`, kept in its first place), why it stopped, and when it was last started
 * (milliseconds since the epoch).
 */
export const ListImport = z
  .object({
    source: z.literal('spotify'),
    state: ListImportState,
    done: Count,
    total: Count,
    unmatched: z.array(ListUnmatched),
    duplicates: Count,
    stopped: ListImportStop.nullable(),
    importedAt: z.number().int(),
  })
  .openapi('ListImport');
export type ListImport = z.infer<typeof ListImport>;

/**
 * One list opened: its summary, then a digest's shows (every subscribed show for The Digest, by
 * title; a custom digest's in the order named; none on any other list), and its entries in
 * order. Entries the index no longer holds, or in a library you may no longer open, are left
 * out. A list imported from Spotify says where its import stands (`import`; null on any other).
 */
export const ListDetail = z
  .object({
    ...ListSummary.shape,
    shows: z.array(LibraryEntry),
    items: z.array(ListItem),
    import: ListImport.nullable(),
  })
  .openapi('ListDetail');
export type ListDetail = z.infer<typeof ListDetail>;

/** One of your lists, by its id. */
export const ListParams = z.object({ id: z.string().min(1).max(64) });
export type ListParams = z.infer<typeof ListParams>;

/**
 * A new list: its kind and name, and for a digest alone its shows and its order (oldest first
 * unless given). A listening list or playlist starts empty.
 */
export const CreateListBody = z
  .object({
    kind: ListKind,
    name: ListName,
    shows: Refs.optional(),
    order: EpisodeOrder.optional(),
  })
  .openapi('CreateListBody');
export type CreateListBody = z.infer<typeof CreateListBody>;

/**
 * A change to a list: a new name, a digest's order, or a custom digest's shows, whole. Each is
 * checked before any is made, so a refused change changes nothing.
 */
export const UpdateListBody = z
  .object({
    name: ListName.optional(),
    order: EpisodeOrder.optional(),
    shows: Refs.optional(),
  })
  .openapi('UpdateListBody');
export type UpdateListBody = z.infer<typeof UpdateListBody>;

/** An entry to add to the end of a listening list or playlist; one already on it stays put. */
export const AddListItemBody = z.object({ ref: MediaRef }).openapi('AddListItemBody');
export type AddListItemBody = z.infer<typeof AddListItemBody>;

/** A listening list's or playlist's entries, whole and in order: reorders and removes. */
export const PutListItemsBody = z.object({ refs: Refs }).openapi('PutListItemsBody');
export type PutListItemsBody = z.infer<typeof PutListItemsBody>;

/**
 * Play a listening list or playlist now, in its order: its unplayed entries from `start` (one of
 * its entries, played from its beginning if finished; else the first unplayed) onwards. A music
 * list plays on the music queue, every song from `start` (else the first) onwards. `rev`, when
 * given, must be the session's revision, else 409.
 */
export const PlayListBody = z
  .object({ start: MediaRef.optional(), rev: Revision.optional() })
  .openapi('PlayListBody');
export type PlayListBody = z.infer<typeof PlayListBody>;

/** A public Spotify playlist to import, as a pasted link (`open.spotify.com/playlist/…`) or URI. */
export const ImportListBody = z
  .object({ from: z.string().trim().min(1).max(2000) })
  .openapi('ImportListBody');
export type ImportListBody = z.infer<typeof ImportListBody>;
