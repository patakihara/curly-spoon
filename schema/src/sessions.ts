/**
 * Listening sessions: what plays on one device. Each of a user's devices keeps its own session,
 * never mixed with another's: a music queue and a spoken queue that podcasts and books share, the
 * queue the controls drive, the queue style and the play history. A session's `rev` goes up on
 * every change, and a write naming an older one is refused, so two tabs on one device cannot
 * overwrite each other.
 */
import { MediaRef } from './play.js';
import { z } from './zod.js';

/** Which queue: music, or the spoken queue podcasts and audiobooks share. */
export const QueueType = z.enum(['music', 'spoken']).openapi('QueueType');
export type QueueType = z.infer<typeof QueueType>;

/**
 * Where Play next and Add to queue land. YouTube Music style: one list after the current item.
 * Spotify style: your queue first, then what is playing from an album or playlist.
 */
export const QueueStyle = z.enum(['youtube', 'spotify']).openapi('QueueStyle');
export type QueueStyle = z.infer<typeof QueueStyle>;

/** A session's revision: it goes up by one on every change. */
export const Revision = z.number().int().nonnegative().openapi('Revision');
export type Revision = z.infer<typeof Revision>;

/**
 * One entry in a queue. `itemId` tells two entries of the same item apart, so a reorder or a
 * removal names exactly one. `chapter` is where in a book this entry plays, by the index of the
 * chapter in its plan; a book enters the spoken queue as one entry per chapter.
 */
export const QueueItem = z
  .object({
    itemId: z.string().uuid(),
    ref: MediaRef,
    chapter: z.number().int().nonnegative().optional(),
  })
  .openapi('QueueItem');
export type QueueItem = z.infer<typeof QueueItem>;

/** Spotify style's "playing from": the album or playlist, and what is left of it. */
export const QueueContext = z
  .object({ from: MediaRef, items: z.array(QueueItem) })
  .openapi('QueueContext');
export type QueueContext = z.infer<typeof QueueContext>;

/**
 * One queue of this device's session. `current` is what plays, or would play again once this
 * queue is active: switching away pauses a queue and keeps its current item. Then `user`, your
 * queue, in order, and `context`, playing-from, which only Spotify style fills.
 */
export const Queue = z
  .object({
    type: QueueType,
    current: QueueItem.nullable(),
    user: z.array(QueueItem),
    context: QueueContext.nullable(),
    rev: Revision,
  })
  .openapi('Queue');
export type Queue = z.infer<typeof Queue>;

/**
 * One item played, newest last by `seq`, which numbers a session's plays from 0. Back makes the
 * newest one current again, in its own queue. `playedAt` is milliseconds since the epoch.
 */
export const HistoryEntry = z
  .object({
    seq: z.number().int().nonnegative(),
    queue: QueueType,
    ref: MediaRef,
    chapter: z.number().int().nonnegative().optional(),
    playedAt: z.number().int(),
  })
  .openapi('HistoryEntry');
export type HistoryEntry = z.infer<typeof HistoryEntry>;

/**
 * One device's listening session, as the session list shows it: the device, whether it is the
 * one asking, the queue the controls drive, the queue to land on after the current item when one
 * is pending, the queue style, and each queue's current item.
 */
export const ListeningSession = z
  .object({
    deviceId: z.string(),
    deviceName: z.string(),
    thisDevice: z.boolean(),
    active: QueueType,
    switchAfterCurrent: QueueType.nullable(),
    queueStyle: QueueStyle,
    currents: z.object({ music: QueueItem.nullable(), spoken: QueueItem.nullable() }),
    rev: Revision,
    updatedAt: z.number().int(),
  })
  .openapi('ListeningSession');
export type ListeningSession = z.infer<typeof ListeningSession>;

/** A user's listening sessions, one per device that has one. */
export const ListeningSessionList = z
  .object({ sessions: z.array(ListeningSession) })
  .openapi('ListeningSessionList');
export type ListeningSessionList = z.infer<typeof ListeningSessionList>;
