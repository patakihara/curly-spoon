/**
 * Lists that aren't queues: listening lists of books and shows you tick through, podcast
 * playlists of episodes you pick, and digests, a rule over shows. The Digest covers every
 * subscription; a custom digest covers the shows you name. A digest holds its shows' unplayed
 * episodes of the last 14 days, oldest or newest first; a playlist leaves out the episodes you
 * played; a listening list crosses off what you finished but keeps it.
 */
import { LibraryEntry } from './library.js';
import { ArtUrl, MediaRef } from './play.js';
import { Revision } from './sessions.js';
import { z } from './zod.js';

/** A share of a whole, from 0 to 1: how far through an item. */
const Fraction = z.number().min(0).max(1);

/** A listening list, a podcast playlist, or a digest. */
export const ListKind = z.enum(['listening', 'playlist', 'digest']).openapi('ListKind');
export type ListKind = z.infer<typeof ListKind>;

/** The order a digest plays its episodes in, by when each was published. */
export const DigestOrder = z.enum(['oldest', 'newest']).openapi('DigestOrder');
export type DigestOrder = z.infer<typeof DigestOrder>;

/** The most entries, or shows, a list holds. */
export const LIST_ENTRIES_MAX = 1000;

/** A list's name: 1 to 200 characters, trimmed. */
const ListName = z.string().trim().min(1).max(200);

/** Entries or shows, at most `LIST_ENTRIES_MAX`; one named twice is kept once, where first named. */
const Refs = z.array(MediaRef).max(LIST_ENTRIES_MAX);

/**
 * One list as your lists show it: its kind, its name, whether it is The Digest, a digest's order
 * (null on any other list), and how many entries it shows now.
 */
export const ListSummary = z
  .object({
    id: z.string(),
    kind: ListKind,
    name: z.string(),
    theDigest: z.boolean(),
    order: DigestOrder.nullable(),
    count: z.number().int().nonnegative(),
  })
  .openapi('ListSummary');
export type ListSummary = z.infer<typeof ListSummary>;

/** Your lists: The Digest first, then the others, oldest first. */
export const ListSummaryList = z.object({ lists: z.array(ListSummary) }).openapi('ListSummaryList');
export type ListSummaryList = z.infer<typeof ListSummaryList>;

/** What a list's entry is: a book or show on a listening list, or an episode. */
export const ListItemKind = z.enum(['book', 'show', 'episode']).openapi('ListItemKind');
export type ListItemKind = z.infer<typeof ListItemKind>;

/**
 * One entry of a list: its title, its author or host, or an episode's show (`sub`), its art (an
 * episode's is its show's), when an episode was published (milliseconds since the epoch; null on
 * a book or show), its length in seconds (null on a show), how far through it you are, and
 * whether you finished it: a book, an episode, or a show whose every episode you finished.
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

/**
 * One list opened: its summary, then a digest's shows (every subscribed show for The Digest, by
 * title; a custom digest's in the order named; none on any other list), and its entries in
 * order. Entries the index no longer holds, or in a library you may no longer open, are left
 * out.
 */
export const ListDetail = z
  .object({
    ...ListSummary.shape,
    shows: z.array(LibraryEntry),
    items: z.array(ListItem),
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
    order: DigestOrder.optional(),
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
    order: DigestOrder.optional(),
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
 * them; else the first) onwards. `rev`, when given, must be the session's revision, else 409.
 */
export const PlayListBody = z
  .object({ start: MediaRef.optional(), rev: Revision.optional() })
  .openapi('PlayListBody');
export type PlayListBody = z.infer<typeof PlayListBody>;
