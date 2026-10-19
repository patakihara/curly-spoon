/**
 * Lists that aren't queues: listening lists of books and shows you tick through, podcast
 * playlists of episodes you pick, and digests, a rule over shows. The Digest covers every
 * subscription; a custom digest covers the shows you name.
 */
import { z } from './zod.js';

/** A listening list, a podcast playlist, or a digest. */
export const ListKind = z.enum(['listening', 'playlist', 'digest']).openapi('ListKind');
export type ListKind = z.infer<typeof ListKind>;

/** The order a digest plays its episodes in, by when each was published. */
export const DigestOrder = z.enum(['oldest', 'newest']).openapi('DigestOrder');
export type DigestOrder = z.infer<typeof DigestOrder>;
