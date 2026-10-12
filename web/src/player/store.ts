/**
 * The web's player store: what is loaded, where it is, whether it plays, its speed and its sleep
 * timer, kept outside React and read through `useSyncExternalStore`. Playing an item plans it
 * (`POST /api/play`) and hands the plan to the engine (`playback.ts`). While it plays it reports
 * every 10 s, and on pause, seek and close, numbered from 0 on each play, with the wall-clock time
 * listened since the last report the server took. A play the server no longer holds (404) is
 * planned again, from where the server says to start. A cut the server answers (`endAt`) goes to
 * the engine; a cut at or before where it is stops it at once and steps on. An item's end, Next
 * and Back step the device's session (`POST /api/sessions/this/step`) and plan what it plays now,
 * reporting under that play from then on. Every change to what plays runs one at a time, in order.
 */
import {
  ListeningSession,
  type MediaRef,
  PlaybackPlan,
  ProgressAnswer,
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
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const browserClock: Clock = {
  now: () => Date.now(),
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
}

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
}

export interface PlayerStore {
  subscribe(listener: () => void): () => void;
  getState(): PlayerState;
  /** Plans `ref` and plays it. */
  play(ref: MediaRef): Promise<void>;
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

const lengthOf = (plan: PlaybackPlan | null) => {
  const last = plan?.tracks.at(-1);
  return last === undefined ? 0 : last.offset + last.duration;
};

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
    listenedMs += now - since;
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

  const report = async () => {
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
    const answered = await api.POST('/api/progress', { body }).catch(() => null);
    if (answered === null || plan?.progressTarget.playId !== playId) return;
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
    await last.destroy(final);
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

  /** Plans `to` and loads its plan, playing it when `autoplay`. */
  const load = async (to: MediaRef, autoplay: boolean) => {
    const answered = await api.POST('/api/play', { body: { ref: to } }).catch(() => null);
    const parsed = PlaybackPlan.safeParse(answered?.data);
    if (!parsed.success) {
      unload();
      return;
    }
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
        controls.position(at, lengthOf(plan), rate());
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
    controls.show(plan.meta, transport);
    setPlaying(autoplay);
    emit();
    if (autoplay) await mine.play();
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
    void gone?.destroy();
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

  const store: PlayerStore = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => state,
    play: (to) =>
      run(async () => {
        await closeCurrent();
        await load(to, true);
      }),
    queueNext: (to, queue) =>
      run(async () => {
        if (plan === null) {
          await load(to, true);
          return;
        }
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
  return store;
}
