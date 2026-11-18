/**
 * Following and unfollowing a show the household holds, for the signed-in person alone. Following
 * claims it as subscribed: it joins their library and The Digest. Unfollowing takes it out of
 * their library, The Digest and their own digests, and a play Audiobookshelf reports for them does
 * not bring it back (`store/claims.ts`); playlists keep the episodes already in them, and their
 * progress stays upstream. Neither asks any upstream: the show, its files and everyone else's
 * standing with it stay in Audiobookshelf, even when the last follower leaves. Anything but an
 * indexed show answers 404. A show the household lacks is followed by requesting it.
 */
import { followShow, parseMediaRefKey, unfollowShow, type MediaRef } from '@auralis/schema';
import type { FastifyInstance } from 'fastify';
import { indexedRow } from '../libraryIndex/store.js';
import { Refusal, serve } from '../route.js';
import * as claims from '../store/claims.js';
import type { Db } from '../store/connection.js';
import { signedIn } from './auth.js';

export function subscriptionRoutes(app: FastifyInstance, options: { db: Db; now: () => number }) {
  const { db, now } = options;

  /** The indexed show `key` names, else 404. */
  const showOf = (key: string): MediaRef => {
    const ref = parseMediaRefKey(key);
    const row = ref === null ? undefined : indexedRow(db, ref.source, ref.id);
    if (ref === null || row?.kind !== 'show' || row.parentId !== null) {
      throw new Refusal(404, 'not_found');
    }
    return ref;
  };

  serve(app, followShow, async (request, _reply, _body, { params }) => {
    const user = signedIn(request);
    claims.followShow(db, user.id, showOf(params.ref), now());
    return { ok: true };
  });

  serve(app, unfollowShow, async (request, _reply, _body, { params }) => {
    const user = signedIn(request);
    claims.unfollowShow(db, user.id, showOf(params.ref), now());
    return { ok: true };
  });
}
