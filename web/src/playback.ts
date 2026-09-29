/**
 * The web player engine: it plays a whole PlaybackPlan from code, with no UI of its own. Two audio
 * elements take turns: the one playing a file, and the one holding the next file, preloaded a
 * little before the end, so the next file starts the moment the last one ends. The position it
 * reports is on the whole item's timeline (the file's offset plus its own time), so chapters and
 * progress work across files. A transcode's one HLS track plays through hls.js, loaded only then,
 * or through the browser's own HLS where it has one, and its session is closed when the player is.
 */
import { type ApiClient, createApiClient } from './api/client';
import { type components } from './generated/api/schema';

export type PlaybackPlan = components['schemas']['PlaybackPlan'];
type Track = PlaybackPlan['tracks'][number];

/** A transcode's one track: an HLS playlist. The same value as the schema's `HLS_MIME`. */
export const HLS_MIME = 'application/vnd.apple.mpegurl';

/** How long before a file ends the next one loads: 20 s, or half a file shorter than 40 s. */
const PRELOAD_LEAD_S = 20;

/** The part of an audio element the engine drives. */
export interface MediaLike {
  src: string;
  preload: string;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
  canPlayType(type: string): string;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
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
  /** Makes one audio element; `new Audio()` by default. */
  createAudio?: () => MediaLike;
  /** Loads hls.js; a lazy import by default. */
  loadHls?: () => Promise<new () => HlsLike>;
  /** Each new position, in seconds from the item's start. */
  onPosition?: (position: number) => void;
  /** The last file has ended. */
  onEnded?: () => void;
}

export interface Player {
  /** Plays from where it is: the plan's `startAt` at first. */
  play(): Promise<void>;
  pause(): void;
  /** Moves to `position` seconds from the item's start, in whichever file holds it. */
  seek(position: number): Promise<void>;
  /** Seconds from the item's start. */
  readonly position: number;
  /** Stops, lets go of both elements, and closes the plan's open playback session if it has one. */
  destroy(): Promise<void>;
}

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
  const createAudio = options.createAudio ?? (() => new Audio());
  const loadHls = options.loadHls ?? loadHlsJs;
  const { tracks } = plan;
  const slots: [Slot, Slot] = [
    { audio: createAudio(), track: null, hls: null },
    { audio: createAudio(), track: null, hls: null },
  ];
  let current = 0;
  let started = false;
  let startAt = plan.startAt;
  const now = () => slots[current]!;
  const spare = () => slots[1 - current]!;

  const trackAt = (position: number) => {
    let index = 0;
    for (let i = 0; i < tracks.length; i++) if (tracks[i]!.offset <= position) index = i;
    return index;
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
    const track: Track = tracks[index]!;
    slot.hls?.destroy();
    slot.hls = null;
    slot.track = index;
    slot.audio.preload = 'auto';
    if (track.mime === HLS_MIME && slot.audio.canPlayType(HLS_MIME) === '') {
      const Hls = await loadHls();
      const hls = new Hls();
      slot.hls = hls;
      hls.loadSource(track.url);
      hls.attachMedia(slot.audio);
    } else {
      slot.audio.src = track.url;
      slot.audio.load();
    }
    slot.audio.currentTime = time;
  };

  const position = () => {
    const slot = now();
    if (slot.track === null) return startAt;
    return tracks[slot.track]!.offset + slot.audio.currentTime;
  };

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
    slot.audio.addEventListener('timeupdate', () => {
      if (!mine()) return;
      options.onPosition?.(position());
      preloadNext();
    });
    slot.audio.addEventListener('ended', () => {
      if (!mine() || slot.track === null) return;
      const next = slot.track + 1;
      if (next >= tracks.length) {
        startAt = tracks[slot.track]!.offset + slot.audio.currentTime;
        options.onEnded?.();
        return;
      }
      const ready = spare().track === next;
      current = 1 - current;
      // Straight from the event: a preloaded file starts in the same task the last one ended in.
      if (ready) void now().audio.play();
      else void put(now(), next, 0).then(() => now().audio.play());
      options.onPosition?.(tracks[next]!.offset);
    });
  };
  slots.forEach(listen);

  return {
    async play() {
      if (!started) {
        started = true;
        await put(now(), trackAt(startAt), startAt - tracks[trackAt(startAt)]!.offset);
      }
      await now().audio.play();
    },
    pause() {
      now().audio.pause();
    },
    async seek(to) {
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
        if (wasPlaying) await target.audio.play();
      }
      options.onPosition?.(position());
    },
    get position() {
      return position();
    },
    async destroy() {
      slots.forEach(release);
      const playId = plan.progressTarget?.playId;
      if (playId === undefined) return;
      const api = options.api ?? createApiClient();
      await api.POST('/api/play/{playId}/close', { params: { path: { playId } } });
    },
  };
}
