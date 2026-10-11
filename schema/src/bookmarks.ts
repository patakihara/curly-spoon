/**
 * Bookmarks: named places in an item, kept on the item's own server as the person. Only
 * Audiobookshelf keeps them, per library item, told apart by their time; Jellyfin keeps none, so
 * a Jellyfin ref is refused. A podcast episode's bookmark sits on its show, as ABS keeps it.
 */
import { MediaRef, MediaRefKey } from './play.js';
import { z } from './zod.js';

/**
 * One bookmark: the item it is in, where in it in seconds from the item's start, its title, and
 * when it was made, in milliseconds since the epoch. Bookmarks made here are at whole seconds;
 * one made by another Audiobookshelf client may not be.
 */
export const Bookmark = z
  .object({
    ref: MediaRef,
    time: z.number().nonnegative(),
    title: z.string(),
    createdAt: z.number().int(),
  })
  .openapi('Bookmark');
export type Bookmark = z.infer<typeof Bookmark>;

/** An item's bookmarks, in the order they sit in it. */
export const BookmarkList = z.object({ bookmarks: z.array(Bookmark) }).openapi('BookmarkList');
export type BookmarkList = z.infer<typeof BookmarkList>;

/** Whose bookmarks to list: the item's ref as it sits in a path, `abs:<id>`. */
export const BookmarksQuery = z.object({ ref: MediaRefKey });
export type BookmarksQuery = z.infer<typeof BookmarksQuery>;

/**
 * A bookmark to make: at whole seconds, since Audiobookshelf deletes one by the number it is
 * at, and a title of 1 to 200 characters.
 */
export const CreateBookmarkBody = z
  .object({
    ref: MediaRef,
    time: z.number().int().nonnegative(),
    title: z.string().trim().min(1).max(200),
  })
  .openapi('CreateBookmarkBody');
export type CreateBookmarkBody = z.infer<typeof CreateBookmarkBody>;

/** One bookmark, by its item's ref and its time as a listing gave it: `12`, or `12.5`. */
export const BookmarkParams = z.object({
  ref: MediaRefKey,
  time: z.string().regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,9})?$/),
});
export type BookmarkParams = z.infer<typeof BookmarkParams>;
