/**
 * The web's player store: what is loaded, where it is, whether it plays, its speed and its sleep
 * timer, kept outside React and read through `useSyncExternalStore`. Playing an item plans it
 * (`POST /api/play`) and hands the plan to the engine (`playback.ts`). While it plays it reports
 * every 10 s, and on pause, seek and close, numbered from 0 on each play, with the time listened
 * since the last report the server took, on a monotonic clock. A play the server no longer holds (404) is
 * planned again, from where the server says to start. A cut the server answers (`endAt`) goes to
 * the engine; a cut at or before where it is stops it at once and steps on. An item's end, Next
 * and Back step the device's session (`POST /api/sessions/this/step`) and plan what it plays now,
 * reporting under that play from then on. Closing a play is best-effort: a failed close is logged and
 * never keeps the player from what comes next. Every change to what plays runs one at a time, in
 * order. After a reload, `restore` plans what this device's session plays, paused where it
 * stopped; as the page is hidden, a last report goes out that the browser keeps sending while it
 * unloads. A request refused for want of a sign-in (401) stops everything and says so. Music is
 * named by the playing track's own title, and its place is within that track. Putting an item next
 * first says where it is, so the server cuts the play after the part playing, not one it left. An
 * item that cannot be planned leaves the player on what it had, or idle; the shell binds no status
 * to show it, so it is logged.
 */
import {
  ListeningSession,
  ListeningSessionList,
  type MediaRef,
  PlaybackPlan,
  ProgressAnswer,
  Queue,
  type QueueType,
} from '@auralis/schema';
import { type ApiClient, createApiClient } from '../api/client';
import { createPlayer, type Player, type PlayerOptions, type ProgressReport } from '../playback';
import { browserMediaControls, type MediaControls, type Transport } from './media-session';

/** The speed steps, from 1 and round to 1 again. */
export const SPEED_STEPS = [1, 1.25, 1.5, 1.75, 2, 0.8] as const;

/** The sleep timer's steps: off, minutes, the end of the chapter, then off again. */
export const SLEEP_STEPS = ['off', 15, 30, 45, 60, 'chapter'] as const;

/** How often a playing item reports where it is. */
export const REPORT_EVERY_MS = 10_000;

const MINUTE_MS = 60_000;

/** How near a stop counts as at it: the engine moves back onto a stop, so this is only rounding. */
const AT_STOP_S = 0.01;

/** Time, and timers on it: the browser's own by default, a test's by hand. */
export interface Clock {
  /** Milliseconds on a clock that never goes back. */
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const browserClock: Clock = {
  // Decision (M1.shell): listening is timed on the monotonic clock; the wall clock can be set back.
  now: () => performance.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface PlayerStoreOptions {
  /** The API; same origin by default. */
  api?: ApiClient;
  /** Makes the engine for a plan; `playback.ts`'s by default. */
  createPlayer?: (plan: PlaybackPlan, options: PlayerOptions) => Player;
  clock?: Clock;
  /** The system's media controls; the browser's media session by default. */
  controls?: MediaControls;
  /** Calls `send` as the page is hidden, for good or into the back cache: `pagehide`. */
  onPageHide?: (send: () => void) => void;
  /** The server refused a request for want of a sign-in; the player has stopped. */
  onSignedOut?: () => void;
}

const browserPageHide = (send: () => void) => {
  if (typeof window !== 'undefined') window.addEventListener('pagehide', send);
};

/** What the store holds, one unchanging object per change. */
export interface PlayerState {
  /** What is loaded, by its ref, and its plan; both null while nothing is. */
  ref: MediaRef | null;
  plan: PlaybackPlan | null;
  /** Seconds from the item's start. */
  position: number;
  /** The whole item's length in seconds. */
  duration: number;
  playing: boolean;
  /** The spoken rate; music plays at 1 whatever it is. */
  speed: number;
  /** The sleep timer as the player names it: "Off", "23 min", "End of chapter". */
  sleep: string;
  /**
   * Whether what a reload left has been looked for, found or not: until then, nothing loaded may
   * only mean not yet.
   */
  restored: boolean;
}

export interface PlayerStore {
  subscribe(listener: () => void): () => void;
  getState(): PlayerState;
  /** Plans `ref` and plays it. */
  play(ref: MediaRef): Promise<void>;
  /**
   * Plays list `id` in its order, from `start`, one of its entries, when given: the list's route
   * makes the spoken queue, and its current item is planned and played.
   */
  playList(id: string, start?: MediaRef): Promise<void>;
  /**
   * Plans what this device's session plays, paused where it stopped, unless something is loaded
   * already: what a reload left. Once only, however often it is asked; nothing where no one is
   * signed in.
   */
  restore(): Promise<void>;
  /** Puts `ref` next in `queue`; with nothing loaded, plays it. */
  queueNext(ref: MediaRef, queue: QueueType): Promise<void>;
  resume(): Promise<void>;
  pause(): Promise<void>;
  /** Moves to `position` seconds from the item's start. */
  seek(position: number): Promise<void>;
  /** Moves `seconds` on, or back when negative. */
  skip(seconds: number): Promise<void>;
  step(direction: 'next' | 'back'): Promise<void>;
  cycleSpeed(): void;
  cycleSleep(): void;
}

type Sleep = { kind: 'off' } | { kind: 'timer'; endsAt: number } | { kind: 'chapter'; at: number };

const logClose = (error: unknown) => console.warn('closing a play failed', error);

/** Logs an item that could not be planned: the shell binds no status to show it in. */
const logPlay = (ref: MediaRef | string) => console.warn('playing failed', ref);

const lengthOf = (plan: PlaybackPlan | null) => {
  const last = plan?.tracks.at(-1);
  return last === undefined ? 0 : last.offset + last.duration;
};

/** What is heard at a place in a plan: its name, and the span of the plan it is the place in. */
export interface Heard {
  title: string;
  sub: string | null;
  /** Where the span starts in the plan, and how long it is, in seconds. */
  offset: number;
  duration: number;
  /** The plan's track it is, for music; null for a spoken item, heard whole. */
  track: number | null;
}

/**
 * What is heard at `position` in `plan`: for music, the track playing there, by its own title and
 * artists, falling back to the plan's; for a book or an episode, the whole item.
 */
export function heardAt(plan: PlaybackPlan, position: number): Heard {
  const { meta, tracks } = plan;
  if (meta.variant !== 'music') {
    return { title: meta.title, sub: meta.sub, offset: 0, duration: lengthOf(plan), track: null };
  }
  let index = 0;
  for (let i = 0; i < tracks.length; i++) if (tracks[i]!.offset <= position) index = i;
  const track = tracks[index]!;
  return {
    title: track.title ?? meta.title,
    sub: track.sub ?? meta.sub,
    offset: track.offset,
    duration: track.duration,
    track: index,
  };
}

/** Where the chapter holding `position` ends; with none, the file's end, else the item's. */
const chapterEnd = (plan: PlaybackPlan, position: number) => {
  const chapter = plan.chapters.find((c) => c.start <= position && position < c.end);
  if (chapter !== undefined) return chapter.end;
  const track = plan.tracks.find((t) => t.offset <= position && position < t.offset + t.duration);
  return track === undefined ? lengthOf(plan) : track.offset + track.duration;
};

export function createPlayerStore(options: PlayerStoreOptions = {}): PlayerStore {
  const api = options.api ?? createApiClient();
  const clock = options.clock ?? browserClock;
  const controls = options.controls ?? browserMediaControls();
  const makePlayer = options.createPlayer ?? createPlayer;
  const onPageHide = options.onPageHide ?? browserPageHide;

  let ref: MediaRef | null = null;
  let plan: PlaybackPlan | null = null;
  let engine: Player | null = null;
  let position = 0;
  let playing = false;
  let speed = 1;
  let sleepStep = 0;
  let sleep: Sleep = { kind: 'off' };
  /** The next report's number on this play. */
  let seq = 0;
  /** Milliseconds played since the last report the server took. */
  let listenedMs = 0;
  /** When playing last started or was last counted; null while paused. */
  let since: number | null = null;
  /** The server's cut, and the stop the engine holds: the nearer of it and the sleep's. */
  let endAt: number | null = null;
  let stop: number | null = null;
  let reportTimer: unknown = null;
  let sleepTimer: unknown = null;
  /** The track the system's controls name: null for a spoken item, undefined before any. */
  let named: number | null | undefined;
  let restoring: Promise<void> | null = null;
  let restored = false;

  const listeners = new Set<() => void>();
  const sleepLabel = () =>
    sleep.kind === 'off'
      ? 'Off'
      : sleep.kind === 'chapter'
        ? 'End of chapter'
        : `${Math.max(1, Math.ceil((sleep.endsAt - clock.now()) / MINUTE_MS))} min`;
  const snapshot = (): PlayerState => ({
    ref,
    plan,
    position,
    duration: lengthOf(plan),
    playing,
    speed,
    sleep: sleepLabel(),
    restored,
  });
  let state = snapshot();
  const emit = () => {
    state = snapshot();
    listeners.forEach((listener) => listener());
  };

  /** One change to what plays at a time, in the order asked; a failed one leaves the next. */
  let chain: Promise<void> = Promise.resolve();
  const run = (op: () => Promise<void>): Promise<void> => {
    const next = chain.then(op).catch(() => undefined);
    chain = next;
    return next;
  };

  const rate = () => (plan?.meta.variant === 'music' ? 1 : speed);

  const count = () => {
    if (since === null) return;
    const now = clock.now();
    // Decision (M1.shell): a clock that went back counts nothing, never negative listening.
    listenedMs += Math.max(0, now - since);
    since = now;
  };

  const stopReports = () => {
    if (reportTimer !== null) clock.clearTimeout(reportTimer);
    reportTimer = null;
  };
  const armReports = () => {
    stopReports();
    reportTimer = clock.setTimeout(() => {
      reportTimer = null;
      if (playing) armReports();
      void report();
    }, REPORT_EVERY_MS);
  };

  const setPlaying = (now: boolean) => {
    count();
    since = now ? clock.now() : null;
    playing = now;
    if (now) armReports();
    else stopReports();
    controls.playing(now);
  };

  /** Hands the engine the nearer of the server's cut and the sleep's stop, when it changed. */
  const applyStop = () => {
    const sleepAt = sleep.kind === 'chapter' ? sleep.at : null;
    const next = endAt === null ? sleepAt : sleepAt === null ? endAt : Math.min(endAt, sleepAt);
    if (next === stop) return;
    stop = next;
    engine?.stopAt(next);
  };

  /** Names what is heard at `at` to the system, again only when a song changes, and where it is. */
  const tellControls = (at: number) => {
    if (plan === null) return;
    const heard = heardAt(plan, at);
    if (heard.track !== named) {
      named = heard.track;
      controls.show(
        plan.meta,
        transport,
        heard.track === null ? undefined : plan.tracks[heard.track],
      );
    }
    controls.position(at - heard.offset, heard.duration, rate());
  };

  /** A request was refused for want of a sign-in: everything stops, and the app is told. */
  const signOut = async () => {
    const last = engine;
    engine = null;
    stopReports();
    if (last !== null) {
      last.pause();
      void last.destroy().catch(logClose);
    }
    unload();
    options.onSignedOut?.();
  };

  /** Reports where it is; `keepalive` keeps it going out while the page unloads. */
  const report = async (keepalive = false) => {
    if (engine === null || plan === null) return;
    const { playId } = plan.progressTarget;
    count();
    const sentMs = listenedMs;
    const body = {
      playId,
      seq: seq++,
      position: engine.position,
      listened: sentMs / 1000,
      paused: !playing,
    };
    const answered = await api.POST('/api/progress', { body, keepalive }).catch(() => null);
    if (answered === null || plan?.progressTarget.playId !== playId) return;
    if (answered.response.status === 401) {
      void run(signOut);
      return;
    }
    if (answered.response.status === 404) {
      void run(() => replan(playId));
      return;
    }
    const answer = ProgressAnswer.safeParse(answered.data);
    if (!answer.success) return;
    if (answer.data.taken) listenedMs = Math.max(0, listenedMs - sentMs);
    seq = Math.max(seq, answer.data.lastSeq + 1);
    endAt = answer.data.endAt ?? null;
    applyStop();
  };

  const setSleep = (to: Sleep, step: number) => {
    sleep = to;
    sleepStep = step;
    if (sleepTimer !== null) clock.clearTimeout(sleepTimer);
    sleepTimer = null;
    if (to.kind === 'timer') tickSleep();
    applyStop();
  };

  /** Counts the timer down by the minute, so its label follows, and pauses when it runs out. */
  const tickSleep = () => {
    if (sleep.kind !== 'timer') return;
    const left = sleep.endsAt - clock.now();
    if (left <= 0) {
      void run(async () => {
        setSleep({ kind: 'off' }, 0);
        await halt();
      });
      return;
    }
    sleepTimer = clock.setTimeout(
      () => {
        sleepTimer = null;
        tickSleep();
        emit();
      },
      left % MINUTE_MS || MINUTE_MS,
    );
  };

  /** Pauses and reports it. */
  const halt = async () => {
    if (engine === null || !playing) {
      emit();
      return;
    }
    engine.pause();
    setPlaying(false);
    emit();
    await report();
  };

  /** Ends the play: its last report goes with the close. */
  const closeCurrent = async () => {
    const last = engine;
    if (last === null) return;
    count();
    since = null;
    stopReports();
    const final: ProgressReport = {
      seq: seq++,
      position: last.position,
      listened: listenedMs / 1000,
      paused: true,
    };
    listenedMs = 0;
    engine = null;
    // Decision (M1.shell): closing is best-effort. A failed close is logged and never keeps the
    // player from what comes next.
    await last.destroy(final).catch(logClose);
  };

  const unload = () => {
    ref = null;
    plan = null;
    position = 0;
    endAt = null;
    stop = null;
    setPlaying(false);
    if (sleep.kind === 'chapter') setSleep({ kind: 'off' }, 0);
    controls.clear();
    emit();
  };

  const transport: Transport = {
    play: () => void store.resume(),
    pause: () => void store.pause(),
    seekTo: (to) => void store.seek(to),
    skip: (seconds) => void store.skip(seconds),
    step: (direction) => void store.step(direction),
  };

  /**
   * Plans `to` and loads its plan, playing it when `autoplay`: false when it could not be planned,
   * leaving the player as it was. A refusal for want of a sign-in stops everything.
   */
  const start = async (to: MediaRef, autoplay: boolean): Promise<boolean> => {
    const answered = await api.POST('/api/play', { body: { ref: to } }).catch(() => null);
    if (answered?.response.status === 401) {
      await signOut();
      return true;
    }
    const parsed = PlaybackPlan.safeParse(answered?.data);
    if (!parsed.success) return false;
    ref = to;
    plan = parsed.data;
    position = plan.startAt;
    seq = 0;
    endAt = null;
    stop = null;
    // The end of a chapter belongs to the item it was set on.
    if (sleep.kind === 'chapter') setSleep({ kind: 'off' }, 0);
    let mine: Player | null = null;
    const ours = () => mine !== null && engine === mine;
    mine = makePlayer(plan, {
      api,
      onPosition: (at) => {
        if (!ours()) return;
        position = at;
        tellControls(at);
        emit();
      },
      onEnded: () => {
        if (ours()) void run(() => advance('next'));
      },
      onStop: () => {
        const stopped = mine;
        void run(() => stoppedAt(stopped));
      },
    });
    engine = mine;
    mine.setRate(rate());
    named = undefined;
    tellControls(position);
    setPlaying(autoplay);
    emit();
    if (autoplay) await mine.play();
    return true;
  };

  /** Plans `to` and loads it, or holds nothing when it cannot be planned. */
  const load = async (to: MediaRef, autoplay: boolean) => {
    if (!(await start(to, autoplay))) unload();
  };

  /** The engine stopped at its stop: the sleep's pauses, the server's steps on. */
  const stoppedAt = async (stopped: Player | null) => {
    if (stopped === null || engine !== stopped) return;
    const at = stopped.position;
    position = at;
    if (sleep.kind === 'chapter' && at >= sleep.at - AT_STOP_S) {
      setSleep({ kind: 'off' }, 0);
      await halt();
      return;
    }
    if (endAt !== null && at >= endAt - AT_STOP_S) await advance('next');
  };

  /** Steps the session and plays what it plays now, playing on if it played. */
  const advance = async (direction: 'next' | 'back') => {
    const playOn = playing;
    await closeCurrent();
    const answered = await api
      .POST('/api/sessions/this/step', { body: { direction } })
      .catch(() => null);
    if (answered?.response.status === 401) {
      await signOut();
      return;
    }
    const session = ListeningSession.safeParse(answered?.data);
    const now = session.success ? session.data.currents[session.data.active] : null;
    if (now === null) {
      unload();
      return;
    }
    await load(now.ref, playOn);
  };

  /** The server no longer holds `playId`: plan the same item again, from where it says. */
  const replan = async (playId: string) => {
    if (ref === null || plan?.progressTarget.playId !== playId) return;
    const playOn = playing;
    const gone = engine;
    engine = null;
    stopReports();
    void gone?.destroy().catch(logClose);
    await load(ref, playOn);
  };

  const seekTo = async (to: number) => {
    if (engine === null || plan === null) return;
    await engine.seek(Math.min(Math.max(to, 0), lengthOf(plan)));
    position = engine.position;
    if (sleep.kind === 'chapter')
      setSleep({ kind: 'chapter', at: chapterEnd(plan, position) }, sleepStep);
    emit();
    await report();
  };

  /**
   * Closes what plays, then plays `pick`'s answer, the item to plan, and whether picking it moved
   * the server's queue. An item that cannot be planned leaves the player on what it had, planned
   * again where the close left it, or idle; but once the queue moved, as a list's play moves it,
   * the player goes idle, since planning what it had would put that back on the new queue. A pick
   * refused for want of a sign-in has stopped everything already.
   */
  const playInstead = async (
    pick: () => Promise<{ to: MediaRef | null; moved: boolean } | 'signedOut'>,
    failed: MediaRef | string,
  ): Promise<void> => {
    const was = ref;
    const playOn = playing;
    await closeCurrent();
    const picked = await pick();
    if (picked === 'signedOut') return;
    const { to, moved } = picked;
    if (to !== null && (await start(to, true))) return;
    logPlay(to ?? failed);
    // Decision (M1.shell): an item that cannot be planned leaves the player on what it had,
    // planned again where the close left it, or idle. The play it had is closed first, so its
    // last place and listening reach the server before anything else plans.
    // Decision (M2.lists): after a list's play moved the queue, the player goes idle instead, so
    // the queue stays as the list made it.
    if (was === null || moved) unload();
    else await load(was, playOn);
  };

  /**
   * The item list `id`'s play makes current, from `start` when given, and whether the play moved
   * the queue: it did when the route answered with the queue, whatever its current.
   */
  const listCurrent = async (
    id: string,
    start: MediaRef | undefined,
  ): Promise<{ to: MediaRef | null; moved: boolean } | 'signedOut'> => {
    const answered = await api
      .POST('/api/lists/{id}/play', {
        params: { path: { id } },
        body: start === undefined ? {} : { start },
      })
      .catch(() => null);
    if (answered?.response.status === 401) {
      await signOut();
      return 'signedOut';
    }
    const queue = Queue.safeParse(answered?.data);
    if (!queue.success) return { to: null, moved: false };
    return { to: queue.data.current?.ref ?? null, moved: true };
  };

  /** Plans what this device's session plays, paused where it stopped, unless something is loaded. */
  const restoreOnce = async () => {
    if (plan !== null) return;
    // Decision (M1.shell): a refusal here restores nothing and sends no one anywhere. Only the
    // sign-in page meets it, as the server signs everyone else in first; a page's own requests
    // send a member whose sign-in lapsed to sign in.
    const answered = await api.GET('/api/sessions').catch(() => null);
    const list = ListeningSessionList.safeParse(answered?.data);
    const mine = list.success ? list.data.sessions.find((s) => s.thisDevice) : undefined;
    const now = mine === undefined ? null : mine.currents[mine.active];
    if (now === null || plan !== null) return;
    await load(now.ref, false);
  };

  const store: PlayerStore = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => state,
    play: (to) => run(() => playInstead(async () => ({ to, moved: false }), to)),
    playList: (id, from) => run(() => playInstead(() => listCurrent(id, from), id)),
    restore: () =>
      (restoring ??= run(async () => {
        try {
          await restoreOnce();
        } finally {
          restored = true;
          emit();
        }
      })),
    queueNext: (to, queue) =>
      run(async () => {
        if (plan === null) {
          await load(to, true);
          return;
        }
        // Decision (M1.shell): the server puts it next after the part it last heard of, and cuts
        // the play there, so it hears where the play is first.
        await report();
        await api
          .POST('/api/queues/{type}/items', {
            params: { path: { type: queue } },
            body: { ref: to, how: 'next' },
          })
          .catch(() => null);
        // Where the play must now stop comes back on the next report: this one.
        await report();
      }),
    resume: () =>
      run(async () => {
        if (engine === null || playing) return;
        setPlaying(true);
        emit();
        await engine.play();
      }),
    pause: () => run(halt),
    seek: (to) => run(() => seekTo(to)),
    skip: (seconds) => run(() => seekTo((engine?.position ?? position) + seconds)),
    step: (direction) =>
      run(async () => {
        if (plan !== null) await advance(direction);
      }),
    cycleSpeed() {
      const at = SPEED_STEPS.indexOf(speed as (typeof SPEED_STEPS)[number]);
      speed = SPEED_STEPS[(at + 1) % SPEED_STEPS.length]!;
      engine?.setRate(rate());
      emit();
    },
    cycleSleep() {
      const step = (sleepStep + 1) % SLEEP_STEPS.length;
      const kind = SLEEP_STEPS[step]!;
      setSleep(
        kind === 'off'
          ? { kind: 'off' }
          : kind === 'chapter'
            ? {
                kind: 'chapter',
                at: plan === null ? 0 : chapterEnd(plan, engine?.position ?? position),
              }
            : { kind: 'timer', endsAt: clock.now() + kind * MINUTE_MS },
        step,
      );
      emit();
    },
  };
  // Decision (M1.shell): as the page goes, its last place goes with it, kept alive past the unload.
  onPageHide(() => {
    if (engine !== null && plan !== null) void report(true);
  });
  return store;
}
