/**
 * Resolving an author's own books from a library's full item list.
 *
 * There is no "fetch one author" or "books by author" route on the BFF — only
 * `GET /libraries/:id/items`, unfiltered by author (see `AuthorPage.tsx`'s own
 * doc comment for why this is the deliberate choice rather than a gap to close).
 * So `AuthorPage` fetches every item once and this pure function does the
 * matching: an author has no record of their own to fetch, the same problem
 * `MusicArtistPage.tsx` solves for a Jellyfin artist by deriving the header from
 * the first album that names them. Here the source is `media.authors`, present
 * on every book.
 */

export interface AuthorBook {
  id: string;
  title: string;
}

export interface LibraryItemWithAuthors {
  id: string;
  media: {
    title: string;
    authors?: Array<{ id: string; name: string }>;
  };
}

export interface AuthorBooksResult {
  authorName: string;
  books: AuthorBook[];
}

/**
 * `null` means "no book in this library names this author id" — a real not-found
 * state, not an empty-but-known author, since there is no author record to confirm
 * existence independent of at least one book.
 */
export function findAuthorBooks(
  authorId: string,
  items: readonly LibraryItemWithAuthors[],
): AuthorBooksResult | null {
  const matches = items.filter((item) => item.media.authors?.some((a) => a.id === authorId));
  if (matches.length === 0) return null;
  const authorName = matches[0]!.media.authors!.find((a) => a.id === authorId)!.name ?? 'Author';
  return {
    authorName,
    books: matches
      .map((item) => ({ id: item.id, title: item.media.title }))
      .sort((a, b) => a.title.localeCompare(b.title)),
  };
}
