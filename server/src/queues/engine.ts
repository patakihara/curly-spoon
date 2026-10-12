/**
 * The queue engine: what each button does to one device's listening session. Every function is
 * pure: it takes a session value and answers a new one, leaving its input alone. What the index
 * knows of an item, autoplay's pick, new entry ids and the clock are injected.
 *
 * A session has two queues, music and spoken (podcasts and books share it), and `active` names
 * the one the controls drive; starting one pauses the other with its current item kept. Music
 * follows the session's queue style; the spoken queue is one list. History is append-only: Back
 * walks back through what played, Forward walks the queue, and nothing leaves a queue
 * unrecoverably.
 *
 * An item enters history exactly once per time it is played, with the play it followed
 * (`after`); a current item carries that play too, so Back always returns to whatever played
 * immediately before it, replays and items put next during a walk included. Back makes an
 * earlier play current again as a replay (`replayOf`), and the item it leaves joins the walk
 * (`walk`) at the front of its queue. Forward plays the walk before the rest of the queue, in
 * queue order: across the two queues, the one whose next walk entry Back stepped over last goes
 * first. Ending a replay records nothing.
 */
import type { MediaRef, PlayingFrom, QueueItem, QueueStyle, QueueType } from '@auralis/schema';
import type { QueueEntry, SessionItem, SessionQueue, SessionValue } from '../store/listening.js';

/** What the index says an item is: a song, an album, a podcast episode or a book. */
export type ItemKind = 'track' | 'album' | 'episode' | 'book';

/** Play it now, put it next, or add it to the end of its queue. */
export type How = 'now' | 'next' | 'end';

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
    // What played immediately before it: the item the controls leave, ended or paused.
    const left = s.queues[s.active].current;
    const ended = retire(s, type, deps);
    const after = type === s.active ? ended : followed(s, left);
    endWalk(s);
    const [current, ...rest] = items as [QueueItem, ...QueueItem[]];
    start(queue, current, after);
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
 * walks forward again through what Back stepped over, and what was put next meanwhile, in queue
 * order, to the item Back left.
 *
 * Back: the play that played immediately before the current one becomes current again, in its
 * own queue, which becomes active; the item it replaced joins the walk, first in line for
 * Forward. History keeps every play. With no earlier play, Back changes nothing.
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
  const after = retire(s, s.active, deps);
  const walked = takeWalked(s);
  if (walked !== null) {
    land(s, walked.queue, walked.item, after);
    return s;
  }
  const target = s.switchAfterCurrent ?? s.active;
  s.switchAfterCurrent = null;
  play(s, target, deps, after);
  return s;
}

function stepBack(session: SessionValue, deps: EngineDeps): SessionValue {
  const current = session.queues[session.active].current;
  const back =
    current?.replayOf === undefined
      ? followed(session, current)
      : before(session, current.replayOf);
  const earlier = session.history.find((h) => h.seq === back);
  if (earlier === undefined) return session;
  const s = structuredClone(session);
  const left = s.queues[s.active];
  if (left.current !== null) {
    const lowest = lowestWalk(s);
    left.user.unshift({ ...parked(left), walk: lowest === null ? 0 : lowest - 1 });
  }
  land(
    s,
    earlier.queue,
    {
      itemId: deps.newId(),
      ref: earlier.ref,
      ...(earlier.chapter === undefined ? {} : { chapter: earlier.chapter }),
      replayOf: earlier.seq,
    },
    undefined,
  );
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
  const after = followed(s, s.queues[s.active].current);
  endWalk(s);
  s.switchAfterCurrent = null;
  play(s, queue, deps, after);
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
 * Ends `type`'s current item and answers its play: it goes to history, unless it is a replay
 * Back brought back, which is there already. (Replays are never recorded twice, however their
 * walk ends.) With no current item, what it answers is the newest play.
 */
function retire(s: SessionValue, type: QueueType, deps: EngineDeps): number | undefined {
  const queue = s.queues[type];
  const item = queue.current;
  clearCurrent(queue);
  if (item === null || item.replayOf !== undefined) return followed(s, item);
  const seq = (s.history.at(-1)?.seq ?? -1) + 1;
  s.history.push({
    seq,
    queue: type,
    ref: item.ref,
    ...(item.chapter === undefined ? {} : { chapter: item.chapter }),
    playedAt: deps.now(),
    ...(item.after === undefined ? {} : { after: item.after }),
  });
  return seq;
}

/**
 * The play that comes next after `item` stops being current without ending: the one it replays,
 * else, as it is no play yet, the one it followed. With no item, the newest play.
 */
function followed(s: SessionValue, item: SessionItem | null): number | undefined {
  if (item === null) return s.history.at(-1)?.seq;
  return item.replayOf ?? item.after;
}

/**
 * The play that played immediately before `seq`. Each play went in right after the one it
 * followed, so laying them out in turn gives the order things actually played, items put next
 * during a walk included.
 */
function before(s: SessionValue, seq: number): number | undefined {
  const played: number[] = [];
  for (const h of s.history) {
    played.splice(h.after === undefined ? 0 : played.indexOf(h.after) + 1, 0, h.seq);
  }
  return played[played.indexOf(seq) - 1];
}

/**
 * Makes `type` active and plays it, following play `after`: its paused current item resumes,
 * else its next item, else autoplay's pick.
 */
function play(s: SessionValue, type: QueueType, deps: EngineDeps, after: number | undefined): void {
  const queue = s.queues[type];
  s.active = type;
  if (queue.current !== null) {
    follow(queue.current, after);
    return;
  }
  const next = queue.user.shift() ?? queue.context?.items.shift() ?? null;
  if (next !== null) start(queue, next, after);
  else {
    const picked = deps.autoplay(type, s);
    if (picked !== null) start(queue, { ...picked, itemId: deps.newId() }, after);
  }
}

/**
 * Makes `item` current in `type`, which becomes active, following play `after`. A current item
 * that queue held while paused waits right after the walk's entries there, with its position.
 */
function land(s: SessionValue, type: QueueType, item: SessionItem, after: number | undefined) {
  const queue = s.queues[type];
  if (queue.current !== null) {
    const at = queue.user.findIndex((i) => i.walk === undefined);
    queue.user.splice(at === -1 ? queue.user.length : at, 0, parked(queue));
  }
  s.active = type;
  start(queue, item, after);
}

/** Makes an entry current, following play `after`, with the position it kept while it waited. */
function start(queue: SessionQueue, item: SessionItem, after: number | undefined): void {
  const current: SessionItem = { ...item };
  delete current.walk;
  delete current.position;
  follow(current, after);
  queue.current = current;
  queue.position = item.position ?? null;
}

/** Notes the play an item follows; a replay follows what its play followed, so it notes none. */
function follow(item: SessionItem, after: number | undefined): void {
  delete item.after;
  if (item.replayOf === undefined && after !== undefined) item.after = after;
}

/** Takes the current item out of its queue, carrying its position. */
function parked(queue: SessionQueue): SessionItem {
  const item: SessionItem = {
    ...queue.current!,
    ...(queue.position === null ? {} : { position: queue.position }),
  };
  delete item.after;
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

/**
 * Takes the walk's next entry: a queue's first entry, when it is the walk's. Queue order decides
 * within a queue; across the two, the entry Back stepped over last (the lowest `walk`) goes first.
 */
function takeWalked(s: SessionValue): { queue: QueueType; item: SessionItem } | null {
  const heads = QUEUES.flatMap((queue) => {
    const walk = s.queues[queue].user[0]?.walk;
    return walk === undefined ? [] : [{ queue, walk }];
  });
  if (heads.length === 0) return null;
  const { queue } = heads.reduce((a, b) => (b.walk < a.walk ? b : a));
  return { queue, item: s.queues[queue].user.shift()! };
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
