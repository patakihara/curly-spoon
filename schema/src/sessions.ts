/**
 * Listening sessions: what plays on one device. Each of a user's devices keeps its own session,
 * never mixed with another's: a music queue and a spoken queue that podcasts and books share, the
 * queue the controls drive, the queue style and the play history. A session's `rev` goes up on
 * every change to what it queues, and a write naming an older one is refused, so two tabs on one
 * device cannot overwrite each other. Where playback is in the current item, and autoplay's pick,
 * are kept as playback goes and leave `rev` alone, so a progress report never makes a view stale.
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

/** A session's revision: it goes up by one on every change to what it queues. */
export const Revision = z.number().int().nonnegative();
export type Revision = z.infer<typeof Revision>;

/**
 * One entry in a queue. `itemId` tells two entries of the same item apart, so a reorder or a
 * removal names exactly one. `chapter` says which entry of a book this is, by the index of the
 * chapter in its plan: a book enters the spoken queue as one entry per chapter. It is never a
 * position; where playback is within the current entry is the queue's `position`.
 */
export const QueueItem = z
  .object({
    itemId: z.string().uuid(),
    ref: MediaRef,
    chapter: z.number().int().nonnegative().optional(),
  })
  .openapi('QueueItem');
export type QueueItem = z.infer<typeof QueueItem>;

/** What a queue can be playing from: an album or a playlist, a podcast show or a book. */
export const PlayingFromKind = z
  .enum(['album', 'playlist', 'show', 'book'])
  .openapi('PlayingFromKind');
export type PlayingFromKind = z.infer<typeof PlayingFromKind>;

/** The album, playlist, show or book a queue is playing from. */
export const PlayingFrom = z
  .object({ kind: PlayingFromKind, ref: MediaRef })
  .openapi('PlayingFrom');
export type PlayingFrom = z.infer<typeof PlayingFrom>;

/**
 * Spotify style's "playing from": what the queue plays from, and what is left of it. `from` is
 * kept once `items` runs out: autoplay continues from it.
 */
export const QueueContext = z
  .object({ from: PlayingFrom, items: z.array(QueueItem) })
  .openapi('QueueContext');
export type QueueContext = z.infer<typeof QueueContext>;

/**
 * Where this device last was in a queue's current item, in milliseconds from its start, and when
 * it was there (milliseconds since the epoch). On resume, the newer of this and the item's
 * upstream progress wins: upstream progress is shared across a user's devices.
 */
export const QueuePosition = z
  .object({ ms: z.number().int().nonnegative(), takenAt: z.number().int() })
  .openapi('QueuePosition');
export type QueuePosition = z.infer<typeof QueuePosition>;

/**
 * One queue of this device's session. `current` is what plays, or would play again once this
 * queue is active: switching away pauses a queue and keeps its current item, and `position`, the
 * device's last position in it. Then `user`, your queue, in order, and `context`, playing-from,
 * which only Spotify style fills.
 */
export const Queue = z
  .object({
    type: QueueType,
    current: QueueItem.nullable(),
    position: QueuePosition.nullable(),
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

/** Each queue's current item: what plays, or would play again once that queue is active. */
export const QueueCurrents = z
  .object({ music: QueueItem.nullable(), spoken: QueueItem.nullable() })
  .openapi('QueueCurrents');
export type QueueCurrents = z.infer<typeof QueueCurrents>;

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
    currents: QueueCurrents,
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

/** One of this device's queues, by its type, as it sits in a path. */
export const QueueParams = z.object({ type: QueueType });
export type QueueParams = z.infer<typeof QueueParams>;

/**
 * This device's queue rewritten by its entries' ids: `user` is your queue and `context` what is
 * left of playing-from, each in the order given. An entry left out is removed; every id named must
 * be one of the queue's own entries (not its current item), named once. `rev` must be the
 * session's revision, else 409.
 */
export const PutQueueBody = z
  .object({
    rev: Revision,
    user: z.array(z.string().uuid()),
    context: z.array(z.string().uuid()).default([]),
  })
  .openapi('PutQueueBody');
export type PutQueueBody = z.infer<typeof PutQueueBody>;

/**
 * Where an item goes: play it now, put it next, add it to the end of its queue, or what its button
 * does (`default`).
 */
export const QueueHow = z.enum(['now', 'next', 'end', 'default']).openapi('QueueHow');
export type QueueHow = z.infer<typeof QueueHow>;

/**
 * An item put into its queue: an album enters as its tracks and a book as its chapters, placed by
 * the session's queue style. `rev`, when given, must be the session's revision, else 409; so it is
 * on every change to a session below.
 */
export const AddToQueueBody = z
  .object({ ref: MediaRef, how: QueueHow, rev: Revision.optional() })
  .openapi('AddToQueueBody');
export type AddToQueueBody = z.infer<typeof AddToQueueBody>;

/** Next plays what follows; back plays again what played before the current item. */
export const StepDirection = z.enum(['next', 'back']).openapi('StepDirection');
export type StepDirection = z.infer<typeof StepDirection>;

export const StepBody = z
  .object({ direction: StepDirection, rev: Revision.optional() })
  .openapi('StepBody');
export type StepBody = z.infer<typeof StepBody>;

/** The meta-queue switch: the queue the controls drive from now on. */
export const ActiveQueueBody = z
  .object({ queue: QueueType, rev: Revision.optional() })
  .openapi('ActiveQueueBody');
export type ActiveQueueBody = z.infer<typeof ActiveQueueBody>;

/** This device's queue style, until settings keep one per person. */
export const QueueStyleBody = z
  .object({ queueStyle: QueueStyle, rev: Revision.optional() })
  .openapi('QueueStyleBody');
export type QueueStyleBody = z.infer<typeof QueueStyleBody>;
