import { type MediaRef, type PlaybackPlan, type ProgressAnswer } from '@auralis/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../api/client';
import { type Player, type PlayerOptions, type ProgressReport } from '../playback';
import { type MediaControls } from './media-session';
import { type Clock, createPlayerStore, SLEEP_STEPS, SPEED_STEPS } from './store';

/** A clock the test moves by hand: its time and the timers due by it. */
class FakeClock implements Clock {
  time = 1_000_000;
  private timers = new Map<number, { at: number; fn: () => void }>();
  private next = 0;
  now() {
    return this.time;
  }
  setTimeout(fn: () => void, ms: number) {
    this.timers.set(++this.next, { at: this.time + ms, fn });
    return this.next;
  }
  clearTimeout(handle: unknown) {
    this.timers.delete(handle as number);
  }
  /** Moves on `ms`, running each timer as its time comes. */
  async advance(ms: number) {
    const end = this.time + ms;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, t]) => t.at <= end)
        .sort(([, a], [, b]) => a.at - b.at)[0];
      if (due === undefined) break;
      this.timers.delete(due[0]);
      this.time = due[1].at;
      due[1].fn();
      await settle();
    }
    this.time = end;
    await settle();
  }
}

/** Lets every pending promise and fetch answer run. */
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve));
};

/** An engine stand-in: what the store asked of it, and its callbacks to fire. */
class FakeEngine implements Player {
  calls: string[] = [];
  position: number;
  paused = true;
  rate = 1;
  cut: number | null = null;
  closedWith: ProgressReport | undefined | null = null;
  /** Closing the play fails, as when the network is gone. */
  closeFails = false;
  constructor(
    readonly plan: PlaybackPlan,
    readonly options: PlayerOptions,
  ) {
    this.position = plan.startAt;
  }
  async play() {
    this.calls.push('play');
    if (this.cut !== null && this.position >= this.cut) {
      this.options.onStop?.();
      return;
    }
    this.paused = false;
  }
  pause() {
    this.calls.push('pause');
    this.paused = true;
  }
  async seek(position: number) {
    this.calls.push(`seek ${position}`);
    this.position = position;
  }
  setRate(rate: number) {
    this.rate = rate;
  }
  stopAt(position: number | null) {
    this.calls.push(`stopAt ${position}`);
    this.cut = position;
    if (position !== null && this.position >= position) {
      this.paused = true;
      this.options.onStop?.();
    }
  }
  async destroy(report?: ProgressReport) {
    this.closedWith = report;
    if (this.closeFails) throw new TypeError('Failed to fetch');
  }
  /** Plays on to `position`, as timeupdate would say. */
  at(position: number) {
    this.position = position;
    this.options.onPosition?.(position);
  }
}

const meta = (variant: 'spoken' | 'music' = 'spoken') => ({
  title: 'The Salt Road',
  sub: 'A. Author',
  art: null,
  variant,
});

const book: MediaRef = { source: 'abs', id: 'book-1' };
const song: MediaRef = { source: 'jellyfin', id: 'a'.repeat(32) };
const episode: MediaRef = { source: 'abs', id: 'ep-1' };

/** A plan of 600 s in two files, chapters at 0, 200 and 450. */
const planOf = (ref: MediaRef, playId: string, startAt: number): PlaybackPlan => ({
  meta: meta(ref.source === 'jellyfin' ? 'music' : 'spoken'),
  tracks: [
    {
      url: `/api/media/${ref.source}:${ref.id}/tracks/0`,
      mime: 'audio/mpeg',
      duration: 300,
      offset: 0,
    },
    {
      url: `/api/media/${ref.source}:${ref.id}/tracks/1`,
      mime: 'audio/mpeg',
      duration: 300,
      offset: 300,
    },
  ],
  chapters:
    ref.id === 'book-1'
      ? [
          { title: 'One', start: 0, end: 200 },
          { title: 'Two', start: 200, end: 450 },
          { title: 'Three', start: 450, end: 600 },
        ]
      : [],
  startAt,
  progressTarget: { playId },
});

interface Sent {
  path: string;
  body: Record<string, unknown> | null;
}

/** The server: plans, progress answers and steps, each request kept. */
function rig(
  options: {
    answers?: (body: Record<string, unknown>) => ProgressAnswer | 404;
    /** Every play's close fails. */
    closeFails?: boolean;
    /** The browser's own clock in place of the test's. */
    browserClock?: boolean;
  } = {},
) {
  const sent: Sent[] = [];
  const engines: FakeEngine[] = [];
  const clock = new FakeClock();
  let plays = 0;
  /** What the session plays after a step, by direction. */
  const after: Record<'next' | 'back', MediaRef | null> = { next: episode, back: book };
  const startAts: number[] = [];
  const controls: string[] = [];
  const media: MediaControls = {
    show: (m) => controls.push(`show ${m.title} ${m.variant}`),
    playing: (p) => controls.push(`playing ${p}`),
    position: (p, d, r) => controls.push(`position ${p}/${d}@${r}`),
    clear: () => controls.push('clear'),
  };
  const api = createApiClient({
    baseUrl: 'http://auralis.test',
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      const text = await request.text();
      const body = text === '' ? null : (JSON.parse(text) as Record<string, unknown>);
      sent.push({ path, body });
      if (path === '/api/play') {
        const ref = body!.ref as MediaRef;
        return Response.json(planOf(ref, `play-${plays++}`, startAts.shift() ?? 0));
      }
      if (path === '/api/progress') {
        const answer = options.answers?.(body!) ?? { taken: true, lastSeq: body!.seq as number };
        if (answer === 404) return Response.json({ error: 'not_found' }, { status: 404 });
        return Response.json(answer);
      }
      if (path === '/api/sessions/this/step') {
        const ref = after[body!.direction as 'next' | 'back'];
        const current = ref === null ? null : { itemId: crypto.randomUUID(), ref };
        return Response.json({
          deviceId: 'd',
          deviceName: 'This browser',
          thisDevice: true,
          active: 'spoken',
          switchAfterCurrent: null,
          queueStyle: 'youtube',
          currents: { music: null, spoken: current },
          rev: 1,
          updatedAt: 0,
        });
      }
      if (path.startsWith('/api/queues/')) {
        return Response.json({
          type: 'spoken',
          current: null,
          position: null,
          user: [],
          context: null,
          rev: 1,
        });
      }
      return Response.json({ ok: true });
    },
  });
  const store = createPlayerStore({
    api,
    ...(options.browserClock === true ? {} : { clock }),
    controls: media,
    createPlayer: (plan, opts) => {
      const engine = new FakeEngine(plan as PlaybackPlan, opts);
      engine.closeFails = options.closeFails === true;
      engines.push(engine);
      return engine;
    },
  });
  const engine = () => engines.at(-1)!;
  const reports = () => sent.filter((s) => s.path === '/api/progress').map((s) => s.body!);
  const paths = () => sent.map((s) => s.path);
  return { store, sent, engines, engine, clock, reports, paths, after, startAts, controls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('[M1.shell] the web player store', () => {
  it('[M1.shell] plays an item by planning it, then starting its plan where the plan starts', async () => {
    const { store, sent, engine, startAts } = rig();
    startAts.push(120);
    await store.play(book);
    expect(sent[0]).toEqual({ path: '/api/play', body: { ref: book } });
    expect(engine().calls).toContain('play');
    const state = store.getState();
    expect(state.plan?.meta.title).toBe('The Salt Road');
    expect(state.position).toBe(120);
    expect(state.playing).toBe(true);
  });

  it('[M1.shell] follows the position the engine reports', async () => {
    const { store, engine } = rig();
    await store.play(book);
    engine().at(42);
    expect(store.getState().position).toBe(42);
  });

  it('[M1.shell] reports every 10 s while playing, numbered from 0, with the wall-clock time listened', async () => {
    const { store, engine, clock, reports } = rig();
    await store.play(book);
    engine().at(10);
    await clock.advance(10_000);
    engine().at(20);
    await clock.advance(10_000);
    expect(reports()).toEqual([
      { playId: 'play-0', seq: 0, position: 10, listened: 10, paused: false },
      { playId: 'play-0', seq: 1, position: 20, listened: 10, paused: false },
    ]);
  });

  it('[M1.shell] reports on pause, then not again while paused, and never counts paused time as listening', async () => {
    const { store, clock, reports } = rig();
    await store.play(book);
    await clock.advance(4_000);
    await store.pause();
    await clock.advance(60_000);
    await store.resume();
    await clock.advance(10_000);
    expect(reports()).toEqual([
      { playId: 'play-0', seq: 0, position: 0, listened: 4, paused: true },
      { playId: 'play-0', seq: 1, position: 0, listened: 10, paused: false },
    ]);
  });

  it('[M1.shell] reports a seek where it lands, and a seek is never listening', async () => {
    const { store, engine, clock, reports } = rig();
    await store.play(book);
    await clock.advance(3_000);
    await store.seek(400);
    expect(engine().calls).toContain('seek 400');
    expect(reports()).toEqual([
      { playId: 'play-0', seq: 0, position: 400, listened: 3, paused: false },
    ]);
  });

  it('[M1.shell] never reports negative listening, even when its clock goes back', async () => {
    const { store, clock, reports } = rig();
    await store.play(book);
    clock.time -= 5_000;
    await store.pause();
    expect(reports()[0]).toMatchObject({ listened: 0 });
  });

  it('[M1.shell] times listening on the monotonic clock, so a wall clock set back changes nothing', async () => {
    let monotonic = 5_000;
    let wall = 1_000_000;
    vi.spyOn(performance, 'now').mockImplementation(() => monotonic);
    vi.spyOn(Date, 'now').mockImplementation(() => wall);
    const { store, reports } = rig({ browserClock: true });
    await store.play(book);
    monotonic += 3_000;
    wall -= 60_000;
    await store.pause();
    expect(reports()[0]).toMatchObject({ listened: 3 });
  });

  it('[M1.shell] counts listening on from the last report the server took', async () => {
    let first = true;
    const { store, clock, reports } = rig({
      answers: (body) => {
        if (first) {
          first = false;
          return { taken: false, lastSeq: 4 };
        }
        return { taken: true, lastSeq: body.seq as number };
      },
    });
    await store.play(book);
    await clock.advance(10_000);
    await clock.advance(10_000);
    expect(reports().map((r) => [r.seq, r.listened])).toEqual([
      [0, 10],
      [5, 20],
    ]);
  });

  it('[M1.shell] plans again from the server’s start when its play is gone, and reports there', async () => {
    let gone = true;
    const { store, engines, clock, reports, startAts } = rig({
      answers: (body) => {
        if (gone) {
          gone = false;
          return 404;
        }
        return { taken: true, lastSeq: body.seq as number };
      },
    });
    await store.play(book);
    startAts.push(250);
    await clock.advance(10_000);
    expect(engines).toHaveLength(2);
    expect(engines[1]!.position).toBe(250);
    expect(engines[1]!.calls).toContain('play');
    await clock.advance(10_000);
    expect(reports().at(-1)).toMatchObject({ playId: 'play-1', seq: 0 });
  });

  it('[M1.shell] hands a cut the server names to the engine', async () => {
    const { store, engine, clock } = rig({
      answers: (body) => ({ taken: true, lastSeq: body.seq as number, endAt: 450 }),
    });
    await store.play(book);
    engine().at(100);
    await clock.advance(10_000);
    expect(engine().cut).toBe(450);
  });

  it('[M1.shell] stops at once and steps on when the cut is at or before where it is', async () => {
    const { store, engines, clock, paths } = rig({
      answers: (body) =>
        body.playId === 'play-0'
          ? { taken: true, lastSeq: body.seq as number, endAt: 100 }
          : { taken: true, lastSeq: body.seq as number },
    });
    await store.play(book);
    engines[0]!.at(100);
    await clock.advance(10_000);
    expect(paths()).toEqual(['/api/play', '/api/progress', '/api/sessions/this/step', '/api/play']);
    expect(engines[0]!.closedWith).toMatchObject({ position: 100, paused: true });
    expect(engines).toHaveLength(2);
    expect(store.getState().ref).toEqual(episode);
    expect(store.getState().playing).toBe(true);
  });

  it('[M1.shell] steps on to what the session plays next when an item ends, and reports under its play', async () => {
    const { store, engines, sent, clock, reports } = rig();
    await store.play(book);
    engines[0]!.at(600);
    engines[0]!.options.onEnded?.();
    await settle();
    expect(sent.find((s) => s.path === '/api/sessions/this/step')?.body).toEqual({
      direction: 'next',
    });
    expect(sent.at(-1)).toEqual({ path: '/api/play', body: { ref: episode } });
    expect(engines[0]!.closedWith).toMatchObject({ position: 600, paused: true });
    expect(engines[1]!.calls).toContain('play');
    await clock.advance(10_000);
    expect(reports().at(-1)).toMatchObject({ playId: 'play-1', seq: 0 });
  });

  it('[M1.shell] steps on when closing the play it leaves fails, and pause and play still work', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { store, engines } = rig({ closeFails: true });
    await store.play(book);
    engines[0]!.at(600);
    engines[0]!.options.onEnded?.();
    await settle();
    expect(store.getState().ref).toEqual(episode);
    expect(store.getState().playing).toBe(true);
    await store.pause();
    expect(store.getState().playing).toBe(false);
    await store.resume();
    expect(store.getState().playing).toBe(true);
    expect(engines[1]!.calls).toEqual(['play', 'pause', 'play']);
    expect(warned).toHaveBeenCalledWith('closing a play failed', expect.any(TypeError));
  });

  it('[M1.shell] plays another item when closing the one it leaves fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { store } = rig({ closeFails: true });
    await store.play(book);
    await store.play(song);
    expect(store.getState().ref).toEqual(song);
    expect(store.getState().playing).toBe(true);
  });

  it('[M1.shell] steps next and back through the session, as asked', async () => {
    const { store, sent } = rig();
    await store.play(episode);
    await store.step('next');
    await store.step('back');
    expect(
      sent.filter((s) => s.path === '/api/sessions/this/step').map((s) => s.body!.direction),
    ).toEqual(['next', 'back']);
    expect(store.getState().ref).toEqual(book);
  });

  it('[M1.shell] keeps a paused item paused across a step', async () => {
    const { store, engines } = rig();
    await store.play(episode);
    await store.pause();
    await store.step('next');
    expect(engines[1]!.calls).not.toContain('play');
    expect(store.getState().playing).toBe(false);
  });

  it('[M1.shell] holds nothing once the session has nothing more to play', async () => {
    const { store, engines, after, controls } = rig();
    after.next = null;
    await store.play(book);
    engines[0]!.options.onEnded?.();
    await settle();
    expect(store.getState().plan).toBeNull();
    expect(controls.at(-1)).toBe('clear');
  });

  it('[M1.shell] skips 15 s back and forward, never before the start or past the end', async () => {
    const { store, engine } = rig();
    await store.play(book);
    engine().at(10);
    await store.skip(-15);
    engine().at(595);
    await store.skip(15);
    expect(engine().calls.filter((c) => c.startsWith('seek'))).toEqual(['seek 0', 'seek 600']);
  });

  it('[M1.shell] steps the speed 1, 1.25, 1.5, 1.75, 2, 0.8 and back to 1, on the engine each time', async () => {
    const { store, engine } = rig();
    await store.play(book);
    const seen: number[] = [];
    for (let i = 0; i < SPEED_STEPS.length; i++) {
      store.cycleSpeed();
      seen.push(store.getState().speed);
      expect(engine().rate).toBe(store.getState().speed);
    }
    expect(seen).toEqual([1.25, 1.5, 1.75, 2, 0.8, 1]);
  });

  it('[M1.shell] keeps its speed for the next book, and plays music at normal speed', async () => {
    const { store, engines } = rig();
    await store.play(book);
    store.cycleSpeed();
    await store.play(song);
    expect(engines[1]!.rate).toBe(1);
    expect(store.getState().speed).toBe(1.25);
    await store.play(episode);
    expect(engines[2]!.rate).toBe(1.25);
  });

  it('[M1.shell] steps the sleep timer Off, 15, 30, 45, 60 min, End of chapter, and Off', async () => {
    const { store } = rig();
    await store.play(book);
    const seen = [store.getState().sleep];
    for (let i = 0; i < SLEEP_STEPS.length; i++) {
      store.cycleSleep();
      seen.push(store.getState().sleep);
    }
    expect(seen).toEqual(['Off', '15 min', '30 min', '45 min', '60 min', 'End of chapter', 'Off']);
  });

  it('[M1.shell] counts the sleep timer down by the minute and pauses when it runs out', async () => {
    const { store, engine, clock, reports } = rig();
    await store.play(book);
    store.cycleSleep();
    await clock.advance(60_000);
    expect(store.getState().sleep).toBe('14 min');
    await clock.advance(14 * 60_000);
    expect(engine().paused).toBe(true);
    expect(store.getState().playing).toBe(false);
    expect(store.getState().sleep).toBe('Off');
    expect(reports().at(-1)).toMatchObject({ paused: true });
  });

  it('[M1.shell] sleeps at the end of the chapter it is in, then turns the timer off', async () => {
    const { store, engine } = rig();
    await store.play(book);
    engine().at(230);
    for (let i = 0; i < 5; i++) store.cycleSleep();
    expect(store.getState().sleep).toBe('End of chapter');
    expect(engine().cut).toBe(450);
    engine().at(450);
    engine().options.onStop?.();
    await settle();
    expect(store.getState().playing).toBe(false);
    expect(store.getState().sleep).toBe('Off');
    expect(engine().cut).toBeNull();
  });

  it('[M1.shell] sleeps at the end of the file it is in where the item has no chapters', async () => {
    const { store, engine } = rig();
    await store.play(episode);
    engine().at(320);
    for (let i = 0; i < 5; i++) store.cycleSleep();
    expect(engine().cut).toBe(600);
  });

  it('[M1.shell] stops at the nearer of the server’s cut and the end of the chapter', async () => {
    const { store, engine, clock } = rig({
      answers: (body) => ({ taken: true, lastSeq: body.seq as number, endAt: 300 }),
    });
    await store.play(book);
    engine().at(230);
    for (let i = 0; i < 5; i++) store.cycleSleep();
    expect(engine().cut).toBe(450);
    await clock.advance(10_000);
    expect(engine().cut).toBe(300);
  });

  it('[M1.shell] names what plays, and where it is, to the system’s media controls', async () => {
    const { store, engine, controls } = rig();
    await store.play(book);
    engine().at(30);
    expect(controls).toContain('show The Salt Road spoken');
    expect(controls).toContain('playing true');
    expect(controls.at(-1)).toBe('position 30/600@1');
  });

  it('[M1.shell] puts an item next in its queue, and plays it at once when nothing is loaded', async () => {
    const { store, sent } = rig();
    await store.queueNext(episode, 'spoken');
    expect(sent.map((s) => s.path)).toEqual(['/api/play']);
    await store.queueNext(book, 'spoken');
    expect(sent.find((s) => s.path === '/api/queues/spoken/items')?.body).toEqual({
      ref: book,
      how: 'next',
    });
  });
});
