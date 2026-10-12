/**
 * The queue engine: what each button does to one device's listening session. Every function is
 * pure: it takes a session value and answers a new one, leaving its input alone. What the index
 * knows of an item, autoplay's pick, new entry ids and the clock are injected.
 *
 * A session has two queues, music and spoken (podcasts and books share it), and `active` names
 * the one the controls drive; starting one pauses the other with its current item kept. Music
 * follows the session's queue style; the spoken queue is one list. History is append-only: Back
 * walks it with a cursor, Forward walks the queue, and nothing leaves a queue unrecoverably.
 */
import type { MediaRef, PlayingFrom, QueueItem, QueueStyle, QueueType } from '@auralis/schema';
import type { SessionQueue, SessionValue } from '../store/listening.js';

/** What the index says an item is: a song, an album, a podcast episode or a book. */
export type ItemKind = 'track' | 'album' | 'episode' | 'book';

/** Play it now, put it next, or add it to the end of its queue. */
export type How = 'now' | 'next' | 'end';

/** A queue entry before it has an id: an item, and which chapter when it is a book's. */
export type QueueEntry = Omit<QueueItem, 'itemId'>;

/** An item as the index answers it: its kind, the entries it enters a queue as, in play order. */
export interface Expansion {
  kind: ItemKind;
  /** An album's tracks, a book's chapters, or the one track or episode. */
  entries: QueueEntry[];
  /** What playing it plays from: its album, its book, an episode's show; null for a lone song. */
  from: PlayingFrom | null;
}

export interface EngineDeps {
  /** The index lookup; null for an item the index does not hold. */
  expand(ref: MediaRef): Expansion | null;
  /**
   * Autoplay: what `queue` plays when it runs out, given the session so far (its history already
   * holds the item that just ended). Null stops the queue. It answers from what the session
   * holds, so a step never waits on an upstream.
   */
  autoplay(queue: QueueType, session: SessionValue): QueueEntry | null;
  newId(): string;
  /** Milliseconds since the epoch. */
  now(): number;
}

const MUSIC_KINDS: ReadonlySet<ItemKind> = new Set(['track', 'album']);

/** The queue an item of this kind plays in. */
export const queueFor = (kind: ItemKind): QueueType => (MUSIC_KINDS.has(kind) ? 'music' : 'spoken');

/** The queue that is playing: the active one, when it has a current item. */
const playing = (s: SessionValue): QueueType | null =>
  s.queues[s.active].current === null ? null : s.active;

/**
 * What an item's button does. A song plays next and an album goes to the end, or either plays
 * now while a podcast or book is playing. An episode or a book plays now when nothing is
 * playing, otherwise next. (Tapping the item itself opens its page; that is not an action here.)
 */
export function defaultAction(session: SessionValue, kind: ItemKind): How {
  const now = playing(session);
  if (queueFor(kind) === 'music') {
    if (now === 'spoken') return 'now';
    return kind === 'track' ? 'next' : 'end';
  }
  return now === null ? 'now' : 'next';
}

/**
 * Puts an item into its queue: `now` makes its first entry current and the queue active, `next`
 * puts it right after the current item, `end` after everything; `default` is its button's
 * action. In Spotify style, playing an album now plays from it: its other tracks follow your
 * queue. Otherwise they go right after it, ahead of the rest of the queue. Put next while the
 * other queue plays, it plays once the current item ends, and playback moves to its queue.
 * Null when the index does not hold the item.
 */
export function add(
  session: SessionValue,
  ref: MediaRef,
  how: How | 'default',
  deps: EngineDeps,
): SessionValue | null {
  const expansion = deps.expand(ref);
  if (expansion === null || expansion.entries.length === 0) return null;
  const s = structuredClone(session);
  const type = queueFor(expansion.kind);
  const queue = s.queues[type];
  const items = expansion.entries.map((e): QueueItem => ({ ...e, itemId: deps.newId() }));
  const action = how === 'default' ? defaultAction(session, expansion.kind) : how;

  if (action === 'end') queue.user.push(...items);
  else if (action === 'next') {
    queue.user.unshift(...items);
    if (type !== s.active) s.switchAfterCurrent = type;
  } else {
    retire(s, type, deps);
    const [current, ...rest] = items as [QueueItem, ...QueueItem[]];
    queue.current = current;
    const fromAlbum = type === 'music' && s.queueStyle === 'spotify' && expansion.from !== null;
    if (fromAlbum) queue.context = { from: expansion.from!, items: rest };
    else {
      queue.user.unshift(...rest);
      if (expansion.from !== null) queue.context = { from: expansion.from, items: [] };
    }
    s.active = type;
    if (s.switchAfterCurrent === type) s.switchAfterCurrent = null;
  }
  return s;
}

/**
 * Next: the current item goes to history and the queue's next item plays, or the other queue's
 * when an item was put next there; a queue that runs out asks autoplay. After Back, next walks
 * forward again through the plays Back stepped over, to the item Back left.
 *
 * Back: the play before the current one becomes current again, in its own queue, which becomes
 * active; the item it replaced goes back to the front of its queue. History keeps every play:
 * Back moves the session's cursor. With no earlier play, Back changes nothing.
 */
export function step(
  session: SessionValue,
  direction: 'next' | 'back',
  deps: EngineDeps,
): SessionValue {
  return direction === 'next' ? stepNext(session, deps) : stepBack(session, deps);
}

function stepNext(session: SessionValue, deps: EngineDeps): SessionValue {
  const s = structuredClone(session);
  const cursor = s.historyCursor;
  if (cursor === null) {
    retire(s, s.active, deps);
  } else {
    clearCurrent(s.queues[s.active]);
    const back = cursor.back - 1;
    s.historyCursor = back > 0 ? { back, resumeQueue: cursor.resumeQueue } : null;
    const target = back > 0 ? s.history[s.history.length - back]!.queue : cursor.resumeQueue;
    if (target !== null) return land(s, target, deps);
  }
  const target = s.switchAfterCurrent ?? s.active;
  s.switchAfterCurrent = null;
  return land(s, target, deps);
}

function stepBack(session: SessionValue, deps: EngineDeps): SessionValue {
  const back = session.historyCursor?.back ?? 0;
  const play = session.history[session.history.length - 1 - back];
  if (play === undefined) return session;
  const s = structuredClone(session);
  const from = s.queues[s.active];
  const resumeQueue =
    s.historyCursor === null
      ? from.current === null
        ? null
        : s.active
      : s.historyCursor.resumeQueue;
  requeueCurrent(from);
  const to = s.queues[play.queue];
  requeueCurrent(to);
  to.current = {
    itemId: deps.newId(),
    ref: play.ref,
    ...(play.chapter === undefined ? {} : { chapter: play.chapter }),
  };
  s.active = play.queue;
  s.historyCursor = { back: back + 1, resumeQueue };
  return s;
}

/**
 * The meta-queue switch: the controls drive `queue` from now on. The other queue is paused with
 * its current item kept; a queue with no current item starts on its next one. A walk Back
 * started ends here.
 */
export function switchTo(session: SessionValue, queue: QueueType): SessionValue {
  if (queue === session.active) return session;
  const s = structuredClone(session);
  s.historyCursor = null;
  s.switchAfterCurrent = null;
  s.active = queue;
  const q = s.queues[queue];
  if (q.current === null) q.current = takeNext(q);
  return s;
}

/**
 * The music queue's style. Moving to YouTube Music style, which has no playing-from list, puts
 * what is left of the album after your queue; what music plays from is kept for autoplay.
 */
export function setQueueStyle(session: SessionValue, style: QueueStyle): SessionValue {
  const s = structuredClone(session);
  s.queueStyle = style;
  const music = s.queues.music;
  if (style === 'youtube' && music.context !== null) {
    music.user.push(...music.context.items);
    music.context.items = [];
  }
  return s;
}

/**
 * Ends `type`'s current item: it goes to history, unless it is a play Back made current again
 * (already in history), which also ends the walk.
 */
function retire(s: SessionValue, type: QueueType, deps: EngineDeps): void {
  const queue = s.queues[type];
  const replay = s.historyCursor !== null && type === s.active;
  s.historyCursor = null;
  const item = queue.current;
  clearCurrent(queue);
  if (item === null || replay) return;
  s.history.push({
    seq: (s.history.at(-1)?.seq ?? -1) + 1,
    queue: type,
    ref: item.ref,
    ...(item.chapter === undefined ? {} : { chapter: item.chapter }),
    playedAt: deps.now(),
  });
}

/**
 * Makes `type` active and plays its next item, or autoplay's when it has none. A current item
 * it held while paused goes back to the front, to play after the one that lands.
 */
function land(s: SessionValue, type: QueueType, deps: EngineDeps): SessionValue {
  const queue = s.queues[type];
  const paused = queue.current;
  clearCurrent(queue);
  s.active = type;
  const next = takeNext(queue);
  if (paused !== null) queue.user.unshift(paused);
  if (next !== null) queue.current = next;
  else {
    const picked = deps.autoplay(type, s);
    queue.current = picked === null ? null : { ...picked, itemId: deps.newId() };
  }
  return s;
}

const takeNext = (queue: SessionQueue): QueueItem | null =>
  queue.user.shift() ?? queue.context?.items.shift() ?? null;

function clearCurrent(queue: SessionQueue): void {
  queue.current = null;
  queue.position = null;
}

/** Puts the current item back at the front of its queue. */
function requeueCurrent(queue: SessionQueue): void {
  if (queue.current !== null) queue.user.unshift(queue.current);
  clearCurrent(queue);
}
