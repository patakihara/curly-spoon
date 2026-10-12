/**
 * Listening sessions as the routes run them: each request works on the caller's own device's
 * session only, read, changed by the queue engine and saved at once, with nothing awaited in
 * between. Every change, and every play started, then works autoplay's picks out again in the
 * background, as the person, never holding up the answer; so does a progress report once the last
 * run is over two minutes old. A failure there is logged and leaves the picks as they were.
 *
 * Where a device is in its current item is kept from its progress reports. On a play or a read,
 * the newer of that and the item's upstream progress, which every device shares, wins.
 */
import { randomUUID } from 'node:crypto';
import {
  type ListeningSession,
  type MediaRef,
  type QueueItem,
  type QueuePosition,
  type QueueType,
} from '@auralis/schema';
import type { AbsClient } from '../adapters/audiobookshelf/client.js';
import { indexedRow } from '../libraryIndex/store.js';
import { Refusal } from '../route.js';
import type { Db } from '../store/connection.js';
import {
  listSessions,
  openSession,
  saveAutoplay,
  savePosition,
  saveSession,
  type SessionItem,
  type SessionValue,
  StaleRevision,
  type StoredSession,
} from '../store/listening.js';
import type { User } from '../store/users.js';
import type { Upstreams } from '../upstream/links.js';
import { autoplayStale, prepareAutoplay, storedAutoplay } from './autoplay.js';
import { add, type EngineDeps, step, switchTo } from './engine.js';
import type { IndexLookup } from './lookup.js';

/** The signed-in person on one of their devices. */
export type Caller = User & { deviceId: string };

export interface Log {
  warn(detail: object, message: string): void;
}

const key = (ref: MediaRef) => `${ref.source}:${ref.id}`;
const QUEUES: readonly QueueType[] = ['music', 'spoken'];

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
}: StoredSession): SessionValue => ({
  active,
  switchAfterCurrent,
  queueStyle,
  queues,
  history,
  autoplay,
  radio,
  autoplayAt,
});

const currentOf = (s: SessionValue) => s.queues[s.active].current;

export class Sessions {
  /** How many autoplay runs each device has under way, by `userId deviceId`. */
  private readonly preparing = new Map<string, number>();

  constructor(
    private readonly options: {
      db: Db;
      lookup: IndexLookup;
      /** The person's own upstream clients. */
      clients: (user: Caller) => Upstreams;
      now: () => number;
      log: Log;
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
    this.refreshAutoplay(caller);
    return saved;
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
   * is, while one of its tracks is current); when it is the paused queue's, that queue resumes. When `ref` is what follows in the queue, past what the
   * device's last plan (`heldBefore`, a ref key) already played, the session steps on to it;
   * otherwise `ref` plays now. Answers what plays after this plan, and the newer of this device's
   * position in the item and the upstream's, when the session holds one.
   */
  async played(
    caller: Caller,
    ref: MediaRef,
    heldBefore: string | null,
  ): Promise<{ next: MediaRef | undefined; position: QueuePosition | null }> {
    const { lookup } = this.options;
    await this.load(caller, [ref]);
    const covered = lookup.covered(ref);
    const s = this.open(caller);
    const holding = QUEUES.find((q) => {
      const c = s.queues[q].current;
      return c !== null && covered.has(key(c.ref));
    });
    let saved = s;
    if (holding !== s.active) {
      const value = valueOf(s);
      const changed =
        holding !== undefined
          ? switchTo(value, holding, this.deps)
          : (this.advancedTo(value, ref, heldBefore) ?? add(value, ref, 'now', this.deps));
      if (changed !== null) saved = this.save(caller, s, changed);
    }
    this.refreshAutoplay(caller);
    // An item the session could not take (one the index does not hold) has nothing after it.
    const now = currentOf(saved);
    if (now === null || !covered.has(key(now.ref))) return { next: undefined, position: null };

    const next = this.nextAfter(valueOf(saved), covered);
    const queue = QUEUES.find((q) => {
      const c = saved.queues[q].current;
      return c !== null && key(c.ref) === key(ref);
    });
    const kept = queue === undefined ? null : saved.queues[queue].position;
    const position = kept === null ? null : newer(kept, await this.upstreamPosition(caller, ref));
    return { next, position };
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

  /** What plays once a plan for the covered refs ends: the first entry stepping next reaches past them. */
  private nextAfter(s: SessionValue, covered: Set<string>): MediaRef | undefined {
    let t = s;
    for (let n = 0; n < LOOKAHEAD; n += 1) {
      t = step(t, 'next', this.deps);
      const c = currentOf(t);
      if (c === null) return undefined;
      if (!covered.has(key(c.ref))) return c.ref;
    }
    return undefined;
  }

  /**
   * Keeps where this device is in the item a play of `refKey` plays, when it is a queue's current
   * item, then works autoplay out again when the last run is over two minutes old.
   */
  progress(caller: Caller, refKey: string, seconds: number): void {
    const s = this.open(caller);
    const now = this.options.now();
    for (const queue of QUEUES) {
      const current = s.queues[queue].current;
      if (current === null || key(current.ref) !== refKey) continue;
      savePosition(this.options.db, caller.id, caller.deviceId, queue, current.itemId, {
        ms: Math.round(seconds * 1000),
        takenAt: now,
      });
    }
    if (autoplayStale(s, now) && !this.preparing.has(`${caller.id} ${caller.deviceId}`)) {
      this.refreshAutoplay(caller);
    }
  }

  /** One of this device's queues, its position the newer of this device's and the upstream's. */
  async queue(caller: Caller, type: QueueType) {
    const s = this.open(caller);
    const q = s.queues[type];
    const position =
      q.current === null
        ? null
        : newer(q.position, await this.upstreamPosition(caller, q.current.ref));
    return { ...this.queueOf(s, type), position };
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
   * them unless the session changed meanwhile (that change works them out itself).
   */
  refreshAutoplay(caller: Caller): void {
    const device = `${caller.id} ${caller.deviceId}`;
    this.preparing.set(device, (this.preparing.get(device) ?? 0) + 1);
    void this.prepare(caller)
      .catch((err: unknown) => this.options.log.warn({ err }, 'autoplay could not be worked out'))
      .finally(() => {
        const left = (this.preparing.get(device) ?? 1) - 1;
        if (left === 0) this.preparing.delete(device);
        else this.preparing.set(device, left);
      });
  }

  private async prepare(caller: Caller): Promise<void> {
    const { db, lookup, log } = this.options;
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
    saveAutoplay(db, caller.id, caller.deviceId, s.rev, done);
  }
}
