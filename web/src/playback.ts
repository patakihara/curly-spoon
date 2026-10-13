/**
 * The web player engine: it plays a whole PlaybackPlan from code, with no UI of its own. Two audio
 * elements take turns: the one playing a file, and the one holding the next file, preloaded a
 * little before the end, so the next file starts the moment the last one ends. The position it
 * reports is on the whole item's timeline (the file's offset plus its own time, no further than
 * its planned end), so chapters and progress work across files. A transcode's one HLS track plays
 * through hls.js, loaded only then, or through the browser's own HLS where it has one. It plays at
 * the rate it is given, its pitch kept, and stops where it is told to, never starting a file past
 * that point. The plan's playback session is closed when the player is.
 */
import { type ApiClient, createApiClient } from './api/client';
import { type components } from './generated/api/schema';

export type PlaybackPlan = components['schemas']['PlaybackPlan'];
export type ProgressReport = components['schemas']['ProgressReport'];
type Track = PlaybackPlan['tracks'][number];

/** A transcode's one track: an HLS playlist. Typed by the generated `HlsMime`, so it cannot drift. */
export const HLS_MIME: components['schemas']['HlsMime'] = 'application/vnd.apple.mpegurl';

/** How long before a file ends the next one loads: 20 s, or half a file shorter than 40 s. */
const PRELOAD_LEAD_S = 20;

/** The part of an audio element the engine drives. */
export interface MediaLike {
  src: string;
  preload: string;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  playbackRate: number;
  /** The rate a newly loaded source plays at. */
  defaultPlaybackRate: number;
  preservesPitch: boolean;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
  canPlayType(type: string): string;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  /** Takes the element out of the document, where the default one lives. */
  remove?(): void;
}

/** The part of hls.js the engine uses. */
export interface HlsLike {
  loadSource(url: string): void;
  attachMedia(media: MediaLike): void;
  destroy(): void;
}

export interface PlayerOptions {
  /** The API, for closing a transcode's session; same origin by default. */
  api?: ApiClient;
  /**
   * Makes one audio element. By default a hidden `<audio>` in the document, so the page can tell
   * audio plays (the update watch waits for it to stop).
   */
  createAudio?: () => MediaLike;
  /** Loads hls.js; a lazy import by default. */
  loadHls?: () => Promise<new () => HlsLike>;
  /** Each new position, in seconds from the item's start. */
  onPosition?: (position: number) => void;
  /** The last file has ended. */
  onEnded?: () => void;
  /** It paused at the stop `stopAt` set, or was asked to play at or past it. */
  onStop?: () => void;
}

export interface Player {
  /** Plays from where it is: the plan's `startAt` at first. */
  play(): Promise<void>;
  pause(): void;
  /** Moves to `position` seconds from the item's start, in whichever file holds it. */
  seek(position: number): Promise<void>;
  /** Seconds from the item's start. */
  readonly position: number;
  /** Plays at `rate` times normal speed, its pitch kept, on this file and every one after. */
  setRate(rate: number): void;
  /**
   * Pauses at `position` seconds from the item's start and never starts a file after it; at or
   * past it already, it pauses at once. Each stop says so through `onStop`. Null plays on.
   */
  stopAt(position: number | null): void;
  /**
   * Stops, lets go of both elements and takes them out of the document, and closes the plan's
   * open playback session, with `report` as its last report when given.
   */
  destroy(report?: ProgressReport): Promise<void>;
}

const audioInDocument = (): MediaLike => {
  const audio = new Audio();
  audio.hidden = true;
  document.body.append(audio);
  return audio;
};

const loadHlsJs = async () => {
  const { default: Hls } = await import('hls.js');
  return Hls as unknown as new () => HlsLike;
};

/** One of the two elements, and the file it holds. */
interface Slot {
  audio: MediaLike;
  track: number | null;
  hls: HlsLike | null;
}

export function createPlayer(plan: PlaybackPlan, options: PlayerOptions = {}): Player {
  const createAudio = options.createAudio ?? audioInDocument;
  const loadHls = options.loadHls ?? loadHlsJs;
  const { tracks } = plan;
  const slots: [Slot, Slot] = [
    { audio: createAudio(), track: null, hls: null },
    { audio: createAudio(), track: null, hls: null },
  ];
  let current = 0;
  let started = false;
  let startAt = plan.startAt;
  let rate = 1;
  /** Where to stop, from the item's start; null plays on. */
  let cut: number | null = null;
  /** Set by `destroy`, whose one run it holds: nothing loads or plays after it. */
  let destroyed: Promise<void> | null = null;
  const unlisten: (() => void)[] = [];
  const now = () => slots[current]!;
  const spare = () => slots[1 - current]!;

  const trackAt = (position: number) => {
    let index = 0;
    for (let i = 0; i < tracks.length; i++) if (tracks[i]!.offset <= position) index = i;
    return index;
  };

  /** A new source can reset an element's rate, so it is set again after every load. */
  const applyRate = (audio: MediaLike) => {
    audio.preservesPitch = true;
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
  };

  const release = (slot: Slot) => {
    slot.hls?.destroy();
    slot.hls = null;
    slot.track = null;
    slot.audio.pause();
    slot.audio.removeAttribute('src');
    slot.audio.load();
  };

  /** Puts track `index` into `slot`, loading it, `time` seconds in. */
  const put = async (slot: Slot, index: number, time: number) => {
    if (destroyed) return;
    const track: Track = tracks[index]!;
    slot.hls?.destroy();
    slot.hls = null;
    slot.track = index;
    slot.audio.preload = 'auto';
    if (track.mime === HLS_MIME && slot.audio.canPlayType(HLS_MIME) === '') {
      const Hls = await loadHls();
      if (destroyed) return;
      const hls = new Hls();
      slot.hls = hls;
      hls.loadSource(track.url);
      hls.attachMedia(slot.audio);
    } else {
      slot.audio.src = track.url;
      slot.audio.load();
    }
    applyRate(slot.audio);
    slot.audio.currentTime = time;
  };

  const position = () => {
    const slot = now();
    if (slot.track === null) return startAt;
    // A file that runs a hair past its planned length is at its end, where the next one starts.
    const track = tracks[slot.track]!;
    return track.offset + Math.min(slot.audio.currentTime, track.duration);
  };

  /** Pauses at the stop, moving back to it from a little past, and says so. */
  const halt = () => {
    const slot = now();
    slot.audio.pause();
    if (cut !== null && slot.track !== null) {
      const track = tracks[slot.track]!;
      const within = cut - track.offset;
      if (within >= 0 && within < slot.audio.currentTime) slot.audio.currentTime = within;
    }
    options.onStop?.();
  };

  const atCut = () => cut !== null && position() >= cut;

  const preloadNext = () => {
    const slot = now();
    if (slot.track === null || slot.track + 1 >= tracks.length) return;
    if (spare().track === slot.track + 1) return;
    const known = slot.audio.duration;
    const length = Number.isFinite(known) ? known : tracks[slot.track]!.duration;
    const lead = Math.min(PRELOAD_LEAD_S, length / 2);
    if (length - slot.audio.currentTime <= lead) void put(spare(), slot.track + 1, 0);
  };

  const listen = (slot: Slot) => {
    const mine = () => slot === now();
    const on = (type: string, listener: () => void) => {
      slot.audio.addEventListener(type, listener);
      unlisten.push(() => slot.audio.removeEventListener(type, listener));
    };
    on('timeupdate', () => {
      if (!mine()) return;
      if (atCut() && !slot.audio.paused) halt();
      options.onPosition?.(position());
      preloadNext();
    });
    on('ended', () => {
      if (!mine() || slot.track === null) return;
      const next = slot.track + 1;
      const end = tracks[slot.track]!.offset + tracks[slot.track]!.duration;
      if (cut !== null && cut <= end) {
        // The stop is where this file ends: the next waits, loaded, at its start.
        if (next < tracks.length) {
          const ready = spare().track === next;
          current = 1 - current;
          if (ready) now().audio.currentTime = 0;
          else void put(now(), next, 0);
        } else startAt = end;
        options.onPosition?.(Math.min(cut, end));
        options.onStop?.();
        return;
      }
      if (next >= tracks.length) {
        startAt = tracks[slot.track]!.offset + slot.audio.currentTime;
        options.onEnded?.();
        return;
      }
      const ready = spare().track === next;
      current = 1 - current;
      // Straight from the event: a preloaded file starts in the same task the last one ended in.
      if (ready) void now().audio.play();
      else void put(now(), next, 0).then(() => (destroyed ? undefined : now().audio.play()));
      options.onPosition?.(tracks[next]!.offset);
    });
  };
  slots.forEach(listen);

  return {
    async play() {
      if (destroyed) return;
      if (!started) {
        started = true;
        await put(now(), trackAt(startAt), startAt - tracks[trackAt(startAt)]!.offset);
        if (destroyed) return;
      }
      if (atCut()) {
        halt();
        return;
      }
      await now().audio.play();
    },
    pause() {
      now().audio.pause();
    },
    async seek(to) {
      if (destroyed) return;
      const index = trackAt(to);
      const time = to - tracks[index]!.offset;
      if (!started) {
        startAt = to;
        return;
      }
      if (now().track === index) {
        now().audio.currentTime = time;
      } else {
        const wasPlaying = !now().audio.paused;
        now().audio.pause();
        const target = spare().track === index ? spare() : now();
        current = slots.indexOf(target);
        if (target.track === index) target.audio.currentTime = time;
        else await put(target, index, time);
        if (destroyed) return;
        if (wasPlaying) await target.audio.play();
      }
      options.onPosition?.(position());
    },
    get position() {
      return position();
    },
    setRate(to) {
      rate = to;
      slots.forEach((slot) => applyRate(slot.audio));
    },
    stopAt(to) {
      cut = to;
      if (started && !destroyed && atCut()) halt();
    },
    destroy(report) {
      destroyed ??= (async () => {
        unlisten.splice(0).forEach((stop) => stop());
        slots.forEach(release);
        slots.forEach((slot) => slot.audio.remove?.());
        const { playId } = plan.progressTarget;
        const api = options.api ?? createApiClient();
        await api.POST('/api/play/{playId}/close', {
          params: { path: { playId } },
          ...(report === undefined ? {} : { body: report }),
        });
      })();
      return destroyed;
    },
  };
}
