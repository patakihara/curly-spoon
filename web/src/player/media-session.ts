/**
 * The system's media controls (the lock screen, a headset's buttons, the browser's own media hub)
 * through the Media Session API: what plays, named by its plan's `meta`, the actions its player
 * offers, and where it is. A book or an episode seeks back and forward; music steps to the
 * previous or next track. A browser without a media session gets nothing, silently.
 */
import { type PlaybackMeta } from '@auralis/schema';

/** The Media Session actions the player answers. */
export type MediaAction =
  'play' | 'pause' | 'seekto' | 'seekbackward' | 'seekforward' | 'previoustrack' | 'nexttrack';

export interface MediaActionDetails {
  seekTime?: number;
  seekOffset?: number;
}

/** The part of `navigator.mediaSession` the controls use. */
export interface MediaSessionLike {
  metadata: unknown;
  playbackState: 'none' | 'paused' | 'playing';
  setActionHandler(
    action: MediaAction,
    handler: ((details: MediaActionDetails) => void) | null,
  ): void;
  setPositionState?(state: { duration: number; playbackRate: number; position: number }): void;
}

/** What `new MediaMetadata(init)` is given. */
export interface MetadataInit {
  title: string;
  artist: string;
  album: string;
  artwork: { src: string; sizes: string }[];
}

/** Makes the session's metadata: `new MediaMetadata(init)` in a browser. */
export type MakeMetadata = (init: MetadataInit) => unknown;

/** What the controls drive: the player's own actions. */
export interface Transport {
  play(): void;
  pause(): void;
  /** Seconds from the item's start. */
  seekTo(position: number): void;
  /** Seconds forward, or back when negative. */
  skip(seconds: number): void;
  step(direction: 'next' | 'back'): void;
}

export interface MediaControls {
  /** Names what plays and offers its variant's actions. */
  show(meta: PlaybackMeta, transport: Transport): void;
  playing(playing: boolean): void;
  /** Seconds in, of `duration`, playing at `rate`. */
  position(position: number, duration: number, rate: number): void;
  /** Nothing is loaded: no name, no actions. */
  clear(): void;
}

/** A book's or episode's skip when the system names none: Sonora's skip, 15 s. */
export const SKIP_SECONDS = 15;

const ACTIONS: readonly MediaAction[] = [
  'play',
  'pause',
  'seekto',
  'seekbackward',
  'seekforward',
  'previoustrack',
  'nexttrack',
];

/** The art the system shows: the medium size, as wide as a lock screen's. */
const artwork = (art: string | null) =>
  art === null ? [] : [{ src: `${art}?size=medium`, sizes: '512x512' }];

export function createMediaControls(
  session: MediaSessionLike | null,
  makeMetadata: MakeMetadata,
): MediaControls {
  const handle = (action: MediaAction, handler: ((details: MediaActionDetails) => void) | null) => {
    // A browser refuses an action it does not know by throwing; that action is simply not offered.
    try {
      session?.setActionHandler(action, handler);
    } catch {
      return;
    }
  };
  return {
    show(meta, transport) {
      if (session === null) return;
      session.metadata = makeMetadata({
        title: meta.title,
        artist: meta.sub ?? '',
        album: '',
        artwork: artwork(meta.art),
      });
      const spoken = meta.variant === 'spoken';
      const handlers: Record<MediaAction, ((details: MediaActionDetails) => void) | null> = {
        play: () => transport.play(),
        pause: () => transport.pause(),
        seekto: (d) => {
          if (d.seekTime !== undefined) transport.seekTo(d.seekTime);
        },
        seekbackward: spoken ? (d) => transport.skip(-(d.seekOffset ?? SKIP_SECONDS)) : null,
        seekforward: spoken ? (d) => transport.skip(d.seekOffset ?? SKIP_SECONDS) : null,
        previoustrack: spoken ? null : () => transport.step('back'),
        nexttrack: spoken ? null : () => transport.step('next'),
      };
      for (const action of ACTIONS) handle(action, handlers[action]);
    },
    playing(playing) {
      if (session !== null) session.playbackState = playing ? 'playing' : 'paused';
    },
    position(position, duration, rate) {
      session?.setPositionState?.({
        duration,
        playbackRate: rate,
        position: Math.min(Math.max(position, 0), duration),
      });
    },
    clear() {
      if (session === null) return;
      session.metadata = null;
      session.playbackState = 'none';
      for (const action of ACTIONS) handle(action, null);
    },
  };
}

/** The browser's own media session, or none where it has none. */
export function browserMediaControls(): MediaControls {
  const session =
    typeof navigator === 'undefined' || !('mediaSession' in navigator)
      ? null
      : (navigator.mediaSession as unknown as MediaSessionLike);
  return createMediaControls(session, (init) => new MediaMetadata(init));
}
