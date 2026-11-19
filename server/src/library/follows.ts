/**
 * Whether a person follows a show, the one rule a show's page and Search both answer by: it is in
 * their own library, or their own Audiobookshelf says they have begun it and they have not unfollowed
 * it (the next library read claims it).
 */
import type { MediaRef } from '@auralis/schema';
import type { Db } from '../store/connection.js';
import { unfollowed } from '../store/claims.js';
import type { AbsAccess } from '../upstream/reach.js';
import { personalView } from './personal.js';

export function follows(
  db: Db,
  userId: string,
  show: MediaRef,
  own: Pick<AbsAccess, 'begun'> | null,
): boolean {
  if (personalView(db, userId).holds(show)) return true;
  return (own?.begun.includes(show.id) ?? false) && !unfollowed(db, userId, show);
}
