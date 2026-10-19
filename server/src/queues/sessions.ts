/**
 * Listening sessions as the routes run them: each request works on the caller's own device's
 * session only, read, changed by the queue engine and saved at once, with nothing awaited in
 * between. Every change, and every play started, then works autoplay's picks out again in the
 * background, as the person; so does a progress report once the last run is over two minutes old.
 * A failure there is logged and leaves the picks as they were. Only a play, or a Next, that needs
 * a pick still being worked out waits for it, and never longer than `AUTOPLAY_WAIT_MS`.
 *
 * A plan of many tracks or chapters (an album, a book) reports its progress under its own ref, as
 * a position from the start of the plan. The session follows it: its current entry moves on to
 * the track or chapter that position falls in, recording each entry passed as played, in order:
 * within one play, an entry is recorded at most once. Where a device is in its current entry is
 * kept from those reports, in the entry's own item: from the start of a book for its chapters,
 * from the start of a track for an album's. On a play or a read, the newer of that and the item's
 * upstream progress, which every device shares, wins. That resumes the same entry only: a plan
 * after a Back, or a Next within the item, starts at the start of the entry it reached.
 *
 * A seek is not a play: a position in an earlier track or chapter of the plan moves the current
 * entry back to it, with nothing recorded in history and nothing taken out of it. Only the
 * device's current play moves its session: the play it started last, until a Back, a Next, a Play
 * now or the switch moves the controls off the entry it played. A late report from a play no
 * longer current changes nothing on the session (the upstream still hears it). The play is named
 * by the play id its plan answered, which every report carries.
 *
 * A track a queue is on plays on through the rest of its album as one plan, as far as stepping
 * next reaches the album's following tracks in order (`albumRun`), so a Next or Back inside an
 * album keeps it gapless.
 *
 * An episode of a digest's own (one its rule put in its queue) that a Next, or a play stepping on
 * to what follows, moves out of that queue (it ended, or was skipped) is marked played: at once in
 * Auralis, then on Audiobookshelf in the background, as the person, once the episode's play
 * session there is closed, so nothing Auralis sends after the mark undoes it. A failure there is
 * logged, the mark Auralis keeps still holds, and the next step or play sends it again. Play now
 * of anything else, and the switch, mark nothing.
 */
import { randomUUID } from 'node:crypto';
import {
  type ListeningSession,
  type MediaRef,
  parseMediaRefKey,
  PLAYED_SHOWN,
  type QueueItem,
  type QueuePosition,
  type QueueType,
  type QueueView,
} from '@auralis/schema';
import type { AbsClient } from '../adapters/audiobookshelf/client.js';
import { albumTracks, indexedRow } from '../libraryIndex/store.js';
import { confirmMark, markPlayed, playedMarks } from '../store/lists.js';
import { Refusal } from '../route.js';
import type { Db } from '../store/connection.js';
import {
  listSessions,
  openSession,
  saveAutoplay,
  savePosition,
  saveSession,
  type QueueEntry,
  type SavedQueue,
  type SessionItem,
  type SessionPlay,
  type SessionValue,
  StaleRevision,
  type StoredSession,
} from '../store/listening.js';
import type { User } from '../store/users.js';
import type { Upstreams } from '../upstream/links.js';
import {
  autoplayKept,
  autoplayStale,
  pendingAutoplay,
  prepareAutoplay,
  storedAutoplay,
} from './autoplay.js';
import { add, type EngineDeps, resumeSaved, step, switchTo } from './engine.js';
import { labelled } from './labels.js';
import type { IndexLookup } from './lookup.js';

/** The signed-in person on one of their devices. */
export type Caller = User & { deviceId: string };

export interface Log {
  warn(detail: object, message: string): void;
}

/** One entry a plan plays, and where it starts in the plan, in seconds. */
export interface PlanEntry {
  entry: QueueEntry;
  start: number;
}

/** A device's current play: its play id, and each entry it recorded as played, with its play. */
interface CurrentPlay {
  playId: string;
  recorded: Map<string, number>;
}

/**
 * A play the device holds: its play id, the ref key it was planned for, and the entries it plays,
 * in order.
 */
export interface HeldPlan {
  playId: string;
  ref: string;
  entries: readonly PlanEntry[];
}

/** How near its end, in seconds, a saved queue's current item counts as finished. */
export const FINISHED_WITHIN_S = 30;

/** How long a play, or a Next at a queue's end, waits for autoplay being worked out. */
export const AUTOPLAY_WAIT_MS = 3_000;

/** What is logged when Audiobookshelf did not take an episode marked played in a digest. */
export const MARK_FAILED =
  'an episode played in a digest could not be marked finished on Audiobookshelf; Auralis keeps its mark';

/** What is logged when autoplay's picks are worked out twice for a session that moved on. */
export const AUTOPLAY_MISSED =
  'autoplay was worked out twice for a session that changed meanwhile; its picks wait for the next run';

const key = (ref: MediaRef) => `${ref.source}:${ref.id}`;
const QUEUES: readonly QueueType[] = ['music', 'spoken'];

const entryKey = (e: QueueEntry) => `${key(e.ref)}#${e.chapter ?? ''}`;
const sameEntry = (a: QueueEntry, b: QueueEntry) => entryKey(a) === entryKey(b);

/** The entry of `entries` a position `seconds` into the plan falls in: the last started by then. */
const entryAt = (entries: readonly PlanEntry[], seconds: number): number => {
  const at = entries.findLastIndex((e) => e.start <= seconds);
  return at === -1 ? 0 : at;
};

/** How far ahead a play's `next` is looked for: past every entry a session could queue. */
const LOOKAHEAD = 10_000;

/** An entry as a client sees it, without what only the session keeps. */
export const plain = (item: SessionItem): QueueItem => ({
  itemId: item.itemId,
  ref: item.ref,
  ...(item.chapter === undefined ? {} : { chapter: item.chapter }),
});

/** The newer of two positions in the same item; either may be missing. */
export function newer(
  saved: QueuePosition | null,
  upstream: QueuePosition | null,
): QueuePosition | null {
  if (saved === null) return upstream;
  if (upstream === null) return saved;
  return saved.takenAt > upstream.takenAt ? saved : upstream;
}

const valueOf = ({
  active,
  switchAfterCurrent,
  queueStyle,
  queues,
  history,
  autoplay,
  radio,
  autoplayAt,
  spokenDigest,
  saved,
}: StoredSession): SessionValue => ({
  active,
  switchAfterCurrent,
  queueStyle,
  queues,
  history,
  autoplay,
  radio,
  autoplayAt,
  spokenDigest,
  saved,
});

const currentOf = (s: SessionValue) => s.queues[s.active].current;

/** The plays `after` recorded that `before` did not hold, played in a digest's queue. */
const leftDigest = (before: SessionValue, after: SessionValue): SessionPlay[] => {
  const newest = before.history.at(-1)?.seq ?? -1;
  return after.history.filter((h) => h.seq > newest && h.list !== undefined);
};

/** What the controls drive: the active queue and its current entry. */
const controlled = (s: SessionValue) => `${s.active} ${currentOf(s)?.itemId ?? ''}`;

export class Sessions {
  /** The autoplay runs each device has under way, by `userId deviceId`. */
  private readonly preparing = new Map<string, Set<Promise<void>>>();
  /**
   * Each device's current play, by `userId deviceId`: held in memory, like the plays themselves,
   * so a restart forgets both together.
   */
  private readonly plays = new Map<string, CurrentPlay>();
  /** Marks being sent to Audiobookshelf, by `userId source:id`. */
  private readonly marking = new Map<string, Promise<void>>();

  constructor(
    private readonly options: {
      db: Db;
      lookup: IndexLookup;
      /** The person's own upstream clients. */
      clients: (user: Caller) => Upstreams;
      now: () => number;
      log: Log;
      /** How long a play or a Next waits for autoplay; `AUTOPLAY_WAIT_MS` when not given. */
      autoplayWaitMs?: number;
      /** Closes the device's play of `ref` upstream, with its last report; never fails. */
      closePlay?: (caller: Caller, ref: MediaRef) => Promise<void>;
    },
  ) {}

  /** The engine's dependencies: the index, autoplay's kept picks, new ids and the clock. */
  readonly deps: EngineDeps = {
    expand: (ref) => this.options.lookup.expand(ref),
    autoplay: storedAutoplay,
    newId: randomUUID,
    now: () => this.options.now(),
  };

  /** This device's session, made on first use. */
  open(caller: Caller): StoredSession {
    const s = openSession(this.options.db, caller.id, caller.deviceId, this.options.now());
    if (s === null) throw new Error('invariant: a signed-in device has no listening session');
    return s;
  }

  /** The caller's sessions, one per device, saying which one is asking. */
  list(caller: Caller): ListeningSession[] {
    return listSessions(this.options.db, caller.id).map((s) => ({
      ...s,
      thisDevice: s.deviceId === caller.deviceId,
    }));
  }

  /** This device's session as the session list shows it. */
  summary(caller: Caller): ListeningSession {
    const mine = this.list(caller).find((s) => s.thisDevice);
    if (mine === undefined) throw new Error('invariant: the session just used is missing');
    return mine;
  }

  /** Reads the chapters of any books among `refs`, as the person, for the engine's lookup. */
  async load(caller: Caller, refs: readonly MediaRef[]): Promise<void> {
    await this.options.lookup.load(refs, this.options.clients(caller).abs);
  }

  /**
   * Changes this device's session with `change` and saves it, then works autoplay out again. A
   * `rev` that is not the session's answers 409 `stale_revision`.
   */
  change(
    caller: Caller,
    rev: number | undefined,
    change: (s: SessionValue) => SessionValue,
  ): StoredSession {
    const s = this.open(caller);
    if (rev !== undefined && rev !== s.rev) throw new Refusal(409, 'stale_revision');
    const saved = this.save(caller, s, change(valueOf(s)));
    // A Back, a Next, a Play now or the switch moves the controls off the play's entry: the play
    // is no longer current, and its late reports change nothing.
    if (controlled(saved) !== controlled(s)) this.plays.delete(this.device(caller));
    this.refreshAutoplay(caller);
    return saved;
  }

  /**
   * Next or Back on this device. An episode a Next moves out of a digest's queue is marked played.
   * A `rev` that is not the session's answers 409 `stale_revision`.
   */
  step(caller: Caller, rev: number | undefined, direction: 'next' | 'back'): StoredSession {
    let left: SessionPlay[] = [];
    const saved = this.change(caller, rev, (s) => {
      const stepped = step(s, direction, this.deps);
      left = leftDigest(s, stepped);
      return stepped;
    });
    this.resendMarks(caller);
    this.markPlayed(caller, left);
    return saved;
  }

  /** Waits for every mark being sent to Audiobookshelf, when the server stops. */
  async settled(): Promise<void> {
    await Promise.all(this.marking.values());
  }

  /** Marks each episode of `plays` played, now, and sends the mark to Audiobookshelf. */
  private markPlayed(caller: Caller, plays: readonly SessionPlay[]): void {
    for (const { ref } of plays) this.mark(caller, ref);
  }

  /**
   * Sends again each of the person's marks Audiobookshelf has not taken, and is not being sent:
   * as made now, so a change there since it was first made does not unmark it once taken.
   */
  private resendMarks(caller: Caller): void {
    for (const [refKey, { confirmed }] of playedMarks(this.options.db, caller.id)) {
      const ref = parseMediaRefKey(refKey);
      if (confirmed || ref === null || this.marking.has(`${caller.id} ${refKey}`)) continue;
      this.mark(caller, ref);
    }
  }

  /**
   * Marks an episode played at once in Auralis, then on Audiobookshelf in the background, as the
   * person: after its play session there closes, so the session's last sync lands before the mark
   * and never undoes it. Notes that Audiobookshelf took it; a failure is logged.
   */
  private mark(caller: Caller, ref: MediaRef): void {
    const { db, log } = this.options;
    const row = indexedRow(db, ref.source, ref.id);
    if (ref.source !== 'abs' || row?.kind !== 'episode' || row.parentId === null) return;
    const show = row.parentId;
    const at = this.options.now();
    markPlayed(db, caller.id, ref, at);
    const sending = `${caller.id} ${key(ref)}`;
    const abs = this.options.clients(caller).abs;
    const sent = (async () => {
      if (abs === null) throw new Error('no Audiobookshelf account is linked');
      await this.options.closePlay?.(caller, ref);
      await abs.markEpisodeFinished(show, ref.id);
      confirmMark(db, caller.id, ref, at);
    })()
      .catch((err: unknown) => log.warn({ err, ref }, MARK_FAILED))
      .finally(() => {
        if (this.marking.get(sending) === sent) this.marking.delete(sending);
      });
    this.marking.set(sending, sent);
  }

  private save(caller: Caller, from: StoredSession, value: SessionValue): StoredSession {
    try {
      const saved = saveSession(
        this.options.db,
        caller.id,
        caller.deviceId,
        from.rev,
        value,
        this.options.now(),
      );
      if (saved === null) throw new Error('invariant: a signed-in device has no listening session');
      return saved;
    } catch (err) {
      if (err instanceof StaleRevision) throw new Refusal(409, 'stale_revision');
      throw err;
    }
  }

  /**
   * A play starts on this device: `ref` becomes its current item, unless it already is (an album
   * is, while one of its tracks is current); when it is the paused queue's, that queue resumes.
   * When `ref` is what follows in the queue, past what the device's last plan (`heldBefore`, a ref
   * key) already played, the session steps on to it; otherwise `ref` plays now. Answers what plays
   * after this plan, and where to start in it: in the current entry, at the newer of this device's
   * position and the upstream's, when the session holds one. With nothing queued after the plan
   * and no autoplay pick kept for its end, it waits for the run this play starts, up to the wait;
   * past it, it answers nothing next and the run goes on (the client reads the pick on its Next).
   * When `ref` is a saved spoken queue's current item, or what follows it once that finished, that
   * queue comes back instead, stepping on in the second case. `playId` becomes the device's
   * current play.
   */
  async played(
    caller: Caller,
    playId: string,
    ref: MediaRef,
    heldBefore: string | null,
    entries: readonly PlanEntry[],
  ): Promise<{ next: MediaRef | undefined; position: QueuePosition | null }> {
    const { lookup } = this.options;
    this.plays.set(this.device(caller), { playId, recorded: new Map() });
    await this.load(caller, [ref]);
    // What the plan plays: an album's tracks, or a track and the rest of its album after it.
    const covered = new Set([...lookup.covered(ref), ...entries.map((e) => key(e.entry.ref))]);
    const s = this.open(caller);
    const holding = QUEUES.find((q) => {
      const c = s.queues[q].current;
      return c !== null && covered.has(key(c.ref));
    });
    let saved = s;
    if (holding !== s.active) {
      const value = valueOf(s);
      const advanced = holding === undefined ? this.advancedTo(value, ref, heldBefore) : null;
      const changed =
        holding !== undefined
          ? switchTo(value, holding, this.deps)
          : (advanced ?? this.resumed(value, covered) ?? add(value, ref, 'now', this.deps));
      if (changed !== null) saved = this.save(caller, s, changed);
      // Stepping on to what follows moves the episode it leaves out of a digest's queue; a Play
      // now leaves it unmarked.
      if (advanced !== null) {
        this.resendMarks(caller);
        this.markPlayed(caller, leftDigest(value, advanced));
      }
    }
    const running = this.refreshAutoplay(caller);
    // An item the session could not take (one the index does not hold) has nothing after it.
    const now = currentOf(saved);
    if (now === null || !covered.has(key(now.ref))) return { next: undefined, position: null };

    let after = this.nextAfter(valueOf(saved), covered);
    if (after.waiting) {
      await this.within(running);
      after = this.nextAfter(valueOf(this.open(caller)), covered);
    }
    return { next: after.next, position: await this.startIn(caller, saved, ref, entries) };
  }

  /**
   * Where a plan for `ref` starts, from the start of the plan: in the queue's current entry, at
   * this device's position there (for the plan's own item, the newer of it and the upstream's).
   * Null when the session keeps no position for the plan's own item.
   */
  private async startIn(
    caller: Caller,
    s: StoredSession,
    ref: MediaRef,
    entries: readonly PlanEntry[],
  ): Promise<QueuePosition | null> {
    const queue = QUEUES.find((q) => {
      const c = s.queues[q].current;
      return c !== null && key(c.ref) === key(ref);
    });
    if (queue !== undefined) {
      const { current, position: kept } = s.queues[queue];
      if (kept === null && this.stepTo(s, current!)) {
        // Decision (M1.sessions): Back, or a Next within the item, lands at the start of the
        // entry it reached; the kept and upstream positions resume the same entry only.
        // Rounded up, so the plan never starts in the entry before it.
        const placed = entries.find((e) => sameEntry(e.entry, current!));
        return { ms: Math.ceil((placed?.start ?? 0) * 1000), takenAt: this.options.now() };
      }
      return kept === null ? null : newer(kept, await this.upstreamPosition(caller, ref));
    }
    // An album: the track its queue is on, at the device's position in that track.
    for (const q of QUEUES) {
      const current = s.queues[q].current;
      const placed =
        current === null ? undefined : entries.find((e) => sameEntry(e.entry, current));
      if (placed === undefined) continue;
      const kept = s.queues[q].position;
      return {
        ms: Math.round(placed.start * 1000) + (kept?.ms ?? 0),
        takenAt: kept?.takenAt ?? this.options.now(),
      };
    }
    return null;
  }

  /**
   * The tracks a play of `ref` plays on through, in order: when `ref` is the track one of this
   * device's queues is on, it and each queued entry stepping next reaches after it (autoplay's
   * picks are not queued), while that is the next track of its album; `album` names the album.
   * Otherwise `ref` alone, with no album.
   */
  albumRun(caller: Caller, ref: MediaRef): { album: string | null; refs: MediaRef[] } {
    const lone = { album: null, refs: [ref] };
    if (ref.source !== 'jellyfin') return lone;
    const { db } = this.options;
    const row = indexedRow(db, ref.source, ref.id);
    if (row?.kind !== 'track' || row.parentId === null) return lone;
    const order = albumTracks(db, row.parentId).map((t) => t.id);
    const s = valueOf(this.open(caller));
    const queue = QUEUES.find((q) => {
      const c = s.queues[q].current;
      return c !== null && c.chapter === undefined && key(c.ref) === key(ref);
    });
    if (queue === undefined) return lone;
    // Decision (M1.shell): a Next or Back inside an album plans the rest of the album the queue
    // holds in order, so it stays gapless; the session's progress follows a plan of many tracks.
    const queued: EngineDeps = { ...this.deps, autoplay: () => null };
    let t = switchTo(s, queue, queued);
    const refs = [ref];
    for (let at = order.indexOf(ref.id) + 1; at > 0 && at < order.length; at += 1) {
      t = step(t, 'next', queued);
      const c = currentOf(t);
      if (
        c === null ||
        c.chapter !== undefined ||
        key(c.ref) !== key({ source: 'jellyfin', id: order[at]! })
      )
        break;
      refs.push(c.ref);
    }
    return refs.length > 1 ? { album: row.parentId, refs } : lone;
  }

  /** True when a step reached `current`: a Back to it, or a Next to it from the same item. */
  private stepTo(s: SessionValue, current: SessionItem): boolean {
    if (current.replayOf !== undefined) return true;
    const followed = s.history.find((h) => h.seq === current.after);
    return followed !== undefined && key(followed.ref) === key(current.ref);
  }

  /**
   * The session stepped on to `ref`, when stepping next reaches it past only what the device's
   * last plan already played (all of an album's tracks, or the same item); null when it does not.
   */
  private advancedTo(
    s: SessionValue,
    ref: MediaRef,
    heldBefore: string | null,
  ): SessionValue | null {
    const current = currentOf(s);
    if (current === null) return null;
    const before = new Set([key(current.ref)]);
    if (heldBefore !== null) {
      const [source, ...id] = heldBefore.split(':');
      const held = { source, id: id.join(':') } as MediaRef;
      for (const k of this.options.lookup.covered(held)) before.add(k);
    }
    let t = s;
    for (let n = 0; n < LOOKAHEAD; n += 1) {
      t = step(t, 'next', this.deps);
      const c = currentOf(t);
      if (c === null) return null;
      if (key(c.ref) === key(ref)) return t;
      if (!before.has(key(c.ref))) return null;
    }
    return null;
  }

  /**
   * Play now of `ref` on `s`: a saved spoken queue it resumes comes back as a play of it would
   * bring it (`resumed`), whole and unrecorded; otherwise it plays now. Null when the index does
   * not hold it.
   */
  playNow(s: SessionValue, ref: MediaRef): SessionValue | null {
    return this.resumed(s, this.options.lookup.covered(ref)) ?? add(s, ref, 'now', this.deps);
  }

  /**
   * `s` with the saved spoken queue the play resumes brought back: the one whose current item is
   * the plan's, else one whose current finished (or that has none) and whose next entry is the
   * plan's, stepped on to it. Null when no saved queue holds the plan's item that way.
   */
  private resumed(s: SessionValue, covered: Set<string>): SessionValue | null {
    const held = s.saved.find(
      (q) => q.queue.current !== null && covered.has(key(q.queue.current.ref)),
    );
    if (held !== undefined) return resumeSaved(s, held.owner, this.deps);
    const next = s.saved.find((q) => {
      const following = this.savedNext(q);
      return following !== null && covered.has(key(following.ref));
    });
    return next === undefined
      ? null
      : step(resumeSaved(s, next.owner, this.deps), 'next', this.deps);
  }

  /**
   * What a saved queue plays next, when its current item finished (its position is within
   * `FINISHED_WITHIN_S` of the entry's end) or it has none: its next entry, else the autoplay pick
   * it kept for that item. Null when its current has not finished, or nothing follows.
   */
  private savedNext(saved: SavedQueue): QueueEntry | null {
    const { current, position, user, context } = saved.queue;
    if (current !== null) {
      // A chapter's position runs from the start of its book, so it is measured to the chapter's
      // end in the book.
      const end = this.options.lookup.endOf(current);
      if (end === null || position === null) return null;
      if (position.ms < (end - FINISHED_WITHIN_S) * 1000) return null;
    }
    const queued = user[0] ?? context?.items[0];
    if (queued !== undefined) return queued;
    const pick = saved.autoplay;
    if (pick === null || current === null || !sameEntry(pick.after, current)) return null;
    return pick.next;
  }

  /**
   * What plays once a plan for the covered refs ends: the first entry stepping next reaches past
   * them. `waiting` when stepping reaches the queue's end with no autoplay pick kept for it yet.
   */
  private nextAfter(
    s: SessionValue,
    covered: Set<string>,
  ): { next: MediaRef | undefined; waiting: boolean } {
    let t = s;
    for (let n = 0; n < LOOKAHEAD; n += 1) {
      const before = t;
      t = step(t, 'next', this.deps);
      const c = currentOf(t);
      if (c === null) return { next: undefined, waiting: !this.autoplayReady(before) };
      if (!covered.has(key(c.ref))) return { next: c.ref, waiting: false };
    }
    return { next: undefined, waiting: false };
  }

  /**
   * False when a Next from `s` would ask autoplay for a pick it keeps none of yet: its queue ends
   * there and the play ending is not the one the kept pick was worked out for.
   */
  private autoplayReady(s: SessionValue): boolean {
    let asked: QueueType | null = null;
    const ended = step(s, 'next', {
      ...this.deps,
      autoplay: (queue, session) => {
        asked = queue;
        return this.deps.autoplay(queue, session);
      },
    });
    return asked === null || autoplayKept(asked, ended);
  }

  /**
   * Before a Next: when it reaches the queue's end while autoplay is being worked out for this
   * device, waits for that run (up to the wait) so the Next plays its pick.
   */
  async beforeNext(caller: Caller): Promise<void> {
    if (!this.preparing.has(this.device(caller))) return;
    if (this.autoplayReady(valueOf(this.open(caller)))) return;
    await this.within(Promise.all(this.preparing.get(this.device(caller)) ?? []));
  }

  /**
   * Keeps where this device is in the plan it holds, from a report `seconds` into the plan, when
   * the plan is the device's current play; a report from any other play changes nothing. When
   * the position falls in a later entry of the plan than the queue's current one, the active
   * queue steps on to it, each entry passed recorded as played unless this play recorded it
   * already (after a seek back); an entry outside the plan in
   * between (an item put next) stops it. When it falls in an earlier one, a seek back, the
   * active queue moves back to it, history untouched. Then works autoplay out again when the
   * last run is over two minutes old.
   */
  progress(caller: Caller, plan: HeldPlan, seconds: number): void {
    // Decision (M1.sessions): a report applies only when it belongs to the device's current play;
    // a late one from a play a Back, Next or Play now left behind would undo that step.
    const playing = this.plays.get(this.device(caller));
    if (playing?.playId !== plan.playId) return;
    const s = this.open(caller);
    const now = this.options.now();
    const at = entryAt(plan.entries, seconds);
    const target = plan.entries[at];
    const position = (entry: QueueEntry | undefined, start: number) => ({
      ms: Math.round(
        (seconds - (entry === undefined || key(entry.ref) === plan.ref ? 0 : start)) * 1000,
      ),
      takenAt: now,
    });
    let moved = false;
    for (const queue of QUEUES) {
      const current = s.queues[queue].current;
      if (current === null) continue;
      const placed = plan.entries.findIndex((e) => sameEntry(e.entry, current));
      if (placed === -1) {
        // The plan's own item, queued as one entry: the position is in that item.
        if (key(current.ref) === plan.ref) {
          savePosition(this.options.db, caller.id, caller.deviceId, queue, current.itemId, {
            ms: Math.round(seconds * 1000),
            takenAt: now,
          });
        }
        continue;
      }
      if (placed === at) {
        savePosition(
          this.options.db,
          caller.id,
          caller.deviceId,
          queue,
          current.itemId,
          position(target?.entry, target?.start ?? 0),
        );
      } else if (placed < at && queue === s.active) {
        const stepped = this.steppedThrough(
          valueOf(s),
          plan.entries.slice(placed + 1, at + 1),
          playing.recorded,
        );
        if (stepped !== null) {
          stepped.queues[queue].position = position(target?.entry, target?.start ?? 0);
          this.save(caller, s, stepped);
          moved = true;
        }
      } else if (placed > at && queue === s.active) {
        // Decision (M1.sessions): a seek is not a play. The session moves back to the entry the
        // position falls in and keeps the position there; nothing is recorded or removed.
        const back = this.movedBack(valueOf(s), queue, plan.entries, at, placed);
        back.queues[queue].position = position(target?.entry, target?.start ?? 0);
        this.save(caller, s, back);
        moved = true;
      }
    }
    if (moved || (autoplayStale(s, now) && !this.preparing.has(this.device(caller)))) {
      this.refreshAutoplay(caller);
    }
  }

  /**
   * `s` with `queue`'s current entry, plan entry `from`, moved back to plan entry `to`. The
   * entries in between, and the one it leaves, wait again ahead of what followed them: before the
   * plan's next entry when the playing-from list holds it, else at the front of the queue, behind
   * a Back walk's entries. The entry moved to follows the play its last play followed, so Back
   * from it returns there. History is left as it is.
   */
  private movedBack(
    s: SessionValue,
    queue: QueueType,
    entries: readonly PlanEntry[],
    to: number,
    from: number,
  ): SessionValue {
    const t = structuredClone(s);
    const q = t.queues[queue];
    const left = q.current!;
    const target = entries[to]!.entry;
    const waiting: SessionItem[] = [
      ...entries
        .slice(to + 1, from)
        .map(({ entry }): SessionItem => ({ ...entry, itemId: this.deps.newId() })),
      plain(left),
    ];
    const following = entries[from + 1]?.entry;
    const inContext =
      following === undefined || q.context === null
        ? -1
        : q.context.items.findIndex((i) => sameEntry(i, following));
    if (inContext !== -1) q.context!.items.splice(inContext, 0, ...waiting.map(plain));
    else {
      const at = q.user.findIndex((i) => i.walk === undefined);
      q.user.splice(at === -1 ? q.user.length : at, 0, ...waiting);
    }
    const last = t.history.findLast((h) => h.queue === queue && sameEntry(h, target));
    const after = last === undefined ? (left.replayOf ?? left.after) : last.after;
    q.current = {
      ...target,
      itemId: this.deps.newId(),
      ...(after === undefined ? {} : { after }),
    };
    return t;
  }

  /**
   * `s` stepped next through exactly `path`, in order; null when a step lands anywhere else. An
   * entry the play recorded already (`recorded`, its play by entry) is not recorded again: the
   * entry stepped to follows that play instead. Each entry recorded joins `recorded`.
   */
  private steppedThrough(
    s: SessionValue,
    path: readonly PlanEntry[],
    recorded: Map<string, number>,
  ): SessionValue | null {
    let t = s;
    const added = new Map<string, number>();
    for (const { entry } of path) {
      const length = t.history.length;
      t = step(t, 'next', this.deps);
      const c = currentOf(t);
      if (c === null || !sameEntry(c, entry)) return null;
      const played = t.history.length > length ? t.history.at(-1)! : undefined;
      if (played === undefined) continue;
      const earlier = recorded.get(entryKey(played)) ?? added.get(entryKey(played));
      if (earlier === undefined) added.set(entryKey(played), played.seq);
      else {
        t.history.pop();
        if (c.after === played.seq) c.after = earlier;
      }
    }
    for (const [k, seq] of added) recorded.set(k, seq);
    return t;
  }

  /**
   * One of this device's queues as the queue page shows it: its position the newer of this
   * device's and the upstream's, every entry labelled, autoplay's kept pick for what the queue
   * follows now (never worked out afresh here), and the session's newest plays.
   */
  async queue(caller: Caller, type: QueueType): Promise<QueueView> {
    const s = this.open(caller);
    const q = s.queues[type];
    const position =
      q.current === null
        ? null
        : newer(q.position, await this.upstreamPosition(caller, q.current.ref));
    const shown = this.queueOf(s, type);
    const pick = pendingAutoplay(type, s);
    const played = s.history.slice(-PLAYED_SHOWN).map(({ after: _after, ...play }) => play);
    const entries = [
      ...(shown.current === null ? [] : [shown.current]),
      ...shown.user,
      ...(shown.context?.items ?? []),
      ...(pick === null ? [] : [pick]),
      ...played,
    ];
    await this.load(
      caller,
      entries.map((e) => e.ref),
    );
    const label = await labelled(
      {
        db: this.options.db,
        lookup: this.options.lookup,
        jellyfin: this.options.clients(caller).jellyfin,
        abs: this.options.clients(caller).abs,
        log: this.options.log,
      },
      entries,
    );
    const view = <T extends QueueItem>(item: T) => ({ ...item, ...label(item) });
    return {
      ...shown,
      position,
      current: shown.current === null ? null : view(shown.current),
      user: shown.user.map(view),
      context:
        shown.context === null
          ? null
          : { from: shown.context.from, items: shown.context.items.map(view) },
      autoplay: pick === null ? null : { ...pick, ...label(pick) },
      played: played.map((play) => ({ ...play, ...label(play) })),
    };
  }

  /**
   * Where the plan this device holds must stop instead of playing on, in seconds from its start:
   * the end of the entry its active queue is on, when the plan's next entry is not what plays
   * after it (an item put next mid-album or mid-book, or the rest taken out). Undefined when the
   * plan plays on, when the active queue is on its last entry or on none of its entries, or when
   * the plan is not the device's current play. A `position` already at or past that cut is the
   * answer itself: the plan stops now.
   */
  endAt(caller: Caller, plan: HeldPlan, position?: number): number | undefined {
    if (this.plays.get(this.device(caller))?.playId !== plan.playId) return undefined;
    const s = valueOf(this.open(caller));
    const current = currentOf(s);
    if (current === null) return undefined;
    const placed = plan.entries.findIndex((e) => sameEntry(e.entry, current));
    const following = placed === -1 ? undefined : plan.entries[placed + 1];
    if (following === undefined) return undefined;
    const after = currentOf(step(s, 'next', this.deps));
    if (after !== null && sameEntry(after, following.entry)) return undefined;
    return position !== undefined && position >= following.start ? position : following.start;
  }

  /** A queue of `s` as a client sees it. */
  queueOf(s: StoredSession, type: QueueType) {
    const q = s.queues[type];
    return {
      type,
      current: q.current === null ? null : plain(q.current),
      position: q.position,
      user: q.user.map(plain),
      context:
        q.context === null ? null : { from: q.context.from, items: q.context.items.map(plain) },
      digest: type === 'spoken' ? s.spokenDigest : null,
      rev: s.rev,
    };
  }

  /**
   * Where the person is in `ref` on its own server, and when that was: Audiobookshelf's progress
   * on a book or an episode. Jellyfin keeps no resume point for music. Null when there is none, or
   * the read fails (logged).
   */
  private async upstreamPosition(caller: Caller, ref: MediaRef): Promise<QueuePosition | null> {
    if (ref.source !== 'abs') return null;
    const abs: AbsClient | null = this.options.clients(caller).abs;
    if (abs === null) return null;
    try {
      const row = indexedRow(this.options.db, ref.source, ref.id);
      const progress =
        row?.kind === 'episode' && row.parentId !== null
          ? await abs.findMyEpisodeProgress(row.parentId, ref.id)
          : await abs.findMyProgress(ref.id);
      if (progress?.lastUpdate === undefined) return null;
      return { ms: Math.round(progress.currentTime * 1000), takenAt: progress.lastUpdate };
    } catch (err) {
      this.options.log.warn({ err, ref }, 'upstream progress could not be read; the device’s wins');
      return null;
    }
  }

  /**
   * Works autoplay's picks out again for this device, in the background, as the person, and keeps
   * them unless the session changed meanwhile. Then it works them out once more on the newer
   * session; a second miss is logged and leaves the picks to the next run. Answers when the run
   * is over, never failing (a failure is logged).
   */
  refreshAutoplay(caller: Caller): Promise<void> {
    const device = this.device(caller);
    const runs = this.preparing.get(device) ?? new Set<Promise<void>>();
    this.preparing.set(device, runs);
    const run: Promise<void> = this.prepare(caller)
      .catch((err: unknown) => this.options.log.warn({ err }, 'autoplay could not be worked out'))
      .finally(() => {
        runs.delete(run);
        if (runs.size === 0 && this.preparing.get(device) === runs) this.preparing.delete(device);
      });
    runs.add(run);
    return run;
  }

  private device(caller: Caller): string {
    return `${caller.id} ${caller.deviceId}`;
  }

  /** Waits for `work`, or for the wait to run out, whichever is first. */
  private async within(work: Promise<unknown>): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const waited = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, this.options.autoplayWaitMs ?? AUTOPLAY_WAIT_MS);
    });
    try {
      await Promise.race([work, waited]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async prepare(caller: Caller): Promise<void> {
    const { db, lookup, log } = this.options;
    for (let tries = 0; tries < 2; tries += 1) {
      const s = this.open(caller);
      const clients = this.options.clients(caller);
      await lookup.load(lookup.autoplayBooks(s), clients.abs);
      const unlinked = (service: string) => () =>
        Promise.reject(new Error(`no ${service} account is linked`));
      const done = await prepareAutoplay(valueOf(s), {
        db,
        expand: (ref) => lookup.expand(ref),
        abs: clients.abs ?? { getMe: unlinked('Audiobookshelf') },
        jellyfin: clients.jellyfin ?? { getInstantMix: unlinked('Jellyfin') },
        log,
        now: this.options.now,
      });
      // A session that moved on meanwhile is read again and its picks worked out once more.
      if (saveAutoplay(db, caller.id, caller.deviceId, s.rev, done)) return;
    }
    log.warn({ deviceId: caller.deviceId }, AUTOPLAY_MISSED);
  }
}
