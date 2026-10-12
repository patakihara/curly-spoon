/**
 * The queue engine: what each button does to one device's listening session. Every function is
 * pure: it takes a session value and answers a new one, leaving its input alone. What the index
 * knows of an item, autoplay's pick, new entry ids and the clock are injected.
 *
 * A session has two queues, music and spoken (podcasts and books share it), and `active` names
 * the one the controls drive; starting one pauses the other with its current item kept. Music
 * follows the session's queue style; the spoken queue is one list. History is append-only: Back
 * walks it, Forward walks the queue, and nothing leaves a queue unrecoverably.
 *
 * An item enters history exactly once per time it is played. Back makes an earlier play current
 * again as a replay (`replayOf`), and the item it leaves joins the walk (`walk`), which Forward
 * plays first, lowest first, before the queue goes on. Ending a replay records nothing.
 */
import type { MediaRef, PlayingFrom, QueueItem, QueueStyle, QueueType } from '@auralis/schema';
import type { SessionItem, SessionQueue, SessionValue } from '../store/listening.js';

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
const QUEUES: readonly QueueType[] = ['music', 'spoken'];

/** The queue an item of this kind plays in. */
export const queueFor = (kind: ItemKind): QueueType => (MUSIC_KINDS.has(kind) ? 'music' : 'spoken');

/** The queue that is playing: the active one, when it has a current item. */
const playing = (s: SessionValue): QueueType | null =>
  s.queues[s.active].current === null ? null : s.active;

/**
 * What an item's button does. When nothing is playing, any item plays now. Otherwise a song
 * plays next and an album goes to the end, or either plays now while a podcast or book is
 * playing; an episode or a book plays next. (Tapping the item itself opens its page; that is not
 * an action here.)
 */
export function defaultAction(session: SessionValue, kind: ItemKind): How {
  const now = playing(session);
  // Sofia's rule: when nothing is playing, a default action starts playback.
  if (now === null) return 'now';
  if (queueFor(kind) === 'spoken') return 'next';
  if (now === 'spoken') return 'now';
  return kind === 'track' ? 'next' : 'end';
}

/**
 * Puts an item into its queue: `now` makes its first entry current and the queue active, `next`
 * puts it right after the current item, `end` after everything; `default` is its button's
 * action. In Spotify style, playing an album now plays from it: its other tracks follow your
 * queue, and what was left of the album before follows them. Otherwise they go right after it,
 * ahead of the rest of the queue. Put next while the other queue plays, it plays once the current
 * item ends, and playback moves to its queue. Null when the index does not hold the item.
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
    const lowest = lowestWalk(s);
    if (lowest !== null) {
      // Put next during a walk, it is a new item: it plays right after the current one, ahead
      // of the rest of the walk, and is recorded when it ends.
      queue.user.unshift(...items.map((item, n) => ({ ...item, walk: lowest - items.length + n })));
    } else if (type !== s.active) {
      // A block put next on the paused queue stays whole: that queue's paused current item
      // waits right after it, keeping its position.
      const paused = queue.current === null ? [] : [parked(queue)];
      queue.user.unshift(...items, ...paused);
      s.switchAfterCurrent = type;
    } else queue.user.unshift(...items);
  } else {
    retire(s, type, deps);
    endWalk(s);
    const [current, ...rest] = items as [QueueItem, ...QueueItem[]];
    queue.current = current;
    if (type === 'music' && s.queueStyle === 'spotify' && expansion.from !== null) {
      // Nothing is discarded: the new album is what music plays from, and the unplayed rest of
      // the one before follows it, ahead of autoplay. Your queue keeps its place ahead of both.
      queue.context = { from: expansion.from, items: [...rest, ...(queue.context?.items ?? [])] };
    } else {
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
 * when an item was put next there; a queue that runs out asks autoplay. After Back, next first
 * walks forward again through what Back stepped over, and what was put next meanwhile, to the
 * item Back left.
 *
 * Back: the play before the current one becomes current again, in its own queue, which becomes
 * active; the item it replaced joins the walk, first in line for Forward. History keeps every
 * play. With no earlier play, Back changes nothing.
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
  retire(s, s.active, deps);
  const walked = takeWalked(s);
  if (walked !== null) {
    land(s, walked.queue, walked.item);
    return s;
  }
  const target = s.switchAfterCurrent ?? s.active;
  s.switchAfterCurrent = null;
  play(s, target, deps);
  return s;
}

function stepBack(session: SessionValue, deps: EngineDeps): SessionValue {
  const from = walkedFrom(session);
  const earlier = session.history.findLast((h) => h.seq < from);
  if (earlier === undefined) return session;
  const s = structuredClone(session);
  const left = s.queues[s.active];
  if (left.current !== null) {
    const lowest = lowestWalk(s);
    left.user.unshift({ ...parked(left), walk: lowest === null ? 0 : lowest - 1 });
  }
  land(s, earlier.queue, {
    itemId: deps.newId(),
    ref: earlier.ref,
    ...(earlier.chapter === undefined ? {} : { chapter: earlier.chapter }),
    replayOf: earlier.seq,
  });
  return s;
}

/**
 * The meta-queue switch: the controls drive `queue` from now on. The other queue is paused with
 * its current item kept; a queue with no current item starts on its next one, or on autoplay's
 * pick when it has none. A walk Back started ends here.
 */
export function switchTo(session: SessionValue, queue: QueueType, deps: EngineDeps): SessionValue {
  if (queue === session.active) return session;
  const s = structuredClone(session);
  endWalk(s);
  s.switchAfterCurrent = null;
  play(s, queue, deps);
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
 * Ends `type`'s current item: it goes to history, unless it is a replay Back brought back, which
 * is there already. (Replays are never recorded twice, however their walk ends.)
 */
function retire(s: SessionValue, type: QueueType, deps: EngineDeps): void {
  const queue = s.queues[type];
  const item = queue.current;
  clearCurrent(queue);
  if (item === null || item.replayOf !== undefined) return;
  s.history.push({
    seq: (s.history.at(-1)?.seq ?? -1) + 1,
    queue: type,
    ref: item.ref,
    ...(item.chapter === undefined ? {} : { chapter: item.chapter }),
    playedAt: deps.now(),
  });
}

/**
 * Makes `type` active and plays it: its paused current item resumes, else its next item, else
 * autoplay's pick.
 */
function play(s: SessionValue, type: QueueType, deps: EngineDeps): void {
  const queue = s.queues[type];
  s.active = type;
  if (queue.current !== null) return;
  const next = queue.user.shift() ?? queue.context?.items.shift() ?? null;
  if (next !== null) start(queue, next);
  else {
    const picked = deps.autoplay(type, s);
    if (picked !== null) start(queue, { ...picked, itemId: deps.newId() });
  }
}

/**
 * Makes `item` current in `type`, which becomes active. A current item that queue held while
 * paused waits right after the walk's entries there, with its position.
 */
function land(s: SessionValue, type: QueueType, item: SessionItem): void {
  const queue = s.queues[type];
  if (queue.current !== null) {
    const after = queue.user.findIndex((i) => i.walk === undefined);
    queue.user.splice(after === -1 ? queue.user.length : after, 0, parked(queue));
  }
  s.active = type;
  start(queue, item);
}

/** Makes an entry current, with the position it kept while it waited. */
function start(queue: SessionQueue, item: SessionItem): void {
  const current: SessionItem = { ...item };
  delete current.walk;
  delete current.position;
  queue.current = current;
  queue.position = item.position ?? null;
}

/** Takes the current item out of its queue, carrying its position. */
function parked(queue: SessionQueue): SessionItem {
  const item: SessionItem = {
    ...queue.current!,
    ...(queue.position === null ? {} : { position: queue.position }),
  };
  clearCurrent(queue);
  return item;
}

function clearCurrent(queue: SessionQueue): void {
  queue.current = null;
  queue.position = null;
}

/** The lowest walk place any entry holds, or null when no walk is under way. */
function lowestWalk(s: SessionValue): number | null {
  const places = QUEUES.flatMap((q) => s.queues[q].user.flatMap((i) => i.walk ?? []));
  return places.length === 0 ? null : Math.min(...places);
}

/** Takes the walk's next entry out of its queue, wherever it sits. */
function takeWalked(s: SessionValue): { queue: QueueType; item: SessionItem } | null {
  const lowest = lowestWalk(s);
  if (lowest === null) return null;
  for (const queue of QUEUES) {
    const at = s.queues[queue].user.findIndex((i) => i.walk === lowest);
    if (at !== -1) return { queue, item: s.queues[queue].user.splice(at, 1)[0]! };
  }
  return null;
}

/**
 * The play Back steps back from: the one the current item replays, else the earliest one the
 * walk still holds ahead, else past the newest.
 */
function walkedFrom(s: SessionValue): number {
  const replay = s.queues[s.active].current?.replayOf;
  if (replay !== undefined) return replay;
  const ahead = QUEUES.flatMap((q) =>
    s.queues[q].user.flatMap((i) => (i.walk === undefined ? [] : (i.replayOf ?? []))),
  );
  return ahead.length === 0 ? Infinity : Math.min(...ahead);
}

/**
 * Ends a walk: what it held stays queued as ordinary entries, played and recorded anew when
 * reached. A replay that is current stays one.
 */
function endWalk(s: SessionValue): void {
  for (const queue of QUEUES) {
    for (const item of s.queues[queue].user) {
      if (item.walk === undefined) continue;
      delete item.walk;
      delete item.replayOf;
    }
  }
}
