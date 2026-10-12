import { describe, expect, it } from 'vitest';
import {
  createMediaControls,
  type MediaAction,
  type MediaActionDetails,
  type MediaSessionLike,
  type Transport,
} from './media-session';

/** A navigator.mediaSession stand-in: what was set, and each action's handler. */
class FakeSession implements MediaSessionLike {
  metadata: unknown = null;
  playbackState: MediaSessionLike['playbackState'] = 'none';
  handlers = new Map<MediaAction, (details: MediaActionDetails) => void>();
  positions: { duration: number; playbackRate: number; position: number }[] = [];
  setActionHandler(action: MediaAction, handler: ((details: MediaActionDetails) => void) | null) {
    if (handler === null) this.handlers.delete(action);
    else this.handlers.set(action, handler);
  }
  setPositionState(state: { duration: number; playbackRate: number; position: number }) {
    this.positions.push(state);
  }
}

function rig() {
  const session = new FakeSession();
  const calls: string[] = [];
  const transport: Transport = {
    play: () => calls.push('play'),
    pause: () => calls.push('pause'),
    seekTo: (position) => calls.push(`seekTo ${position}`),
    skip: (seconds) => calls.push(`skip ${seconds}`),
    step: (direction) => calls.push(`step ${direction}`),
  };
  const controls = createMediaControls(session, (init) => ({ made: init }));
  return { session, calls, transport, controls };
}

const book = {
  title: 'The Salt Road',
  sub: 'A. Author',
  art: '/api/media/abs:b/art',
  variant: 'spoken' as const,
};
const song = { title: 'A song', sub: null, art: null, variant: 'music' as const };

describe('[M1.shell] the system’s media controls', () => {
  it('[M1.shell] names what plays: its title, its artist or author, and its art', () => {
    const { session, transport, controls } = rig();
    controls.show(book, transport);
    expect(session.metadata).toEqual({
      made: {
        title: 'The Salt Road',
        artist: 'A. Author',
        album: '',
        artwork: [{ src: '/api/media/abs:b/art?size=medium', sizes: '512x512' }],
      },
    });
  });

  it('[M1.shell] names a play with no art and no artist with neither', () => {
    const { session, transport, controls } = rig();
    controls.show(song, transport);
    expect(session.metadata).toEqual({
      made: { title: 'A song', artist: '', album: '', artwork: [] },
    });
  });

  it('[M1.shell] gives a book or episode play, pause, seeking and skipping back and forward, never previous or next', () => {
    const { session, transport, controls } = rig();
    controls.show(book, transport);
    expect([...session.handlers.keys()].sort()).toEqual([
      'pause',
      'play',
      'seekbackward',
      'seekforward',
      'seekto',
    ]);
  });

  it('[M1.shell] gives music play, pause, seeking, previous and next, never skipping', () => {
    const { session, transport, controls } = rig();
    controls.show(book, transport);
    controls.show(song, transport);
    expect([...session.handlers.keys()].sort()).toEqual([
      'nexttrack',
      'pause',
      'play',
      'previoustrack',
      'seekto',
    ]);
  });

  it('[M1.shell] passes each action on to the player', () => {
    const { session, transport, controls, calls } = rig();
    controls.show(book, transport);
    session.handlers.get('play')!({});
    session.handlers.get('pause')!({});
    session.handlers.get('seekto')!({ seekTime: 42 });
    session.handlers.get('seekbackward')!({});
    session.handlers.get('seekforward')!({ seekOffset: 30 });
    controls.show(song, transport);
    session.handlers.get('previoustrack')!({});
    session.handlers.get('nexttrack')!({});
    expect(calls).toEqual([
      'play',
      'pause',
      'seekTo 42',
      'skip -15',
      'skip 30',
      'step back',
      'step next',
    ]);
  });

  it('[M1.shell] tells the system where it is in what plays, at what rate, on each position', () => {
    const { session, controls } = rig();
    controls.position(30, 600, 1.5);
    controls.position(601, 600, 1.5);
    expect(session.positions).toEqual([
      { duration: 600, playbackRate: 1.5, position: 30 },
      { duration: 600, playbackRate: 1.5, position: 600 },
    ]);
  });

  it('[M1.shell] says whether it plays or sits paused, and lets go of everything once nothing is loaded', () => {
    const { session, transport, controls } = rig();
    controls.show(book, transport);
    controls.playing(true);
    expect(session.playbackState).toBe('playing');
    controls.playing(false);
    expect(session.playbackState).toBe('paused');
    controls.clear();
    expect(session.playbackState).toBe('none');
    expect(session.metadata).toBeNull();
    expect(session.handlers.size).toBe(0);
  });

  it('[M1.shell] does nothing where the browser has no media session', () => {
    const controls = createMediaControls(null, (init) => init);
    const { transport } = rig();
    expect(() => {
      controls.show(book, transport);
      controls.playing(true);
      controls.position(1, 2, 1);
      controls.clear();
    }).not.toThrow();
  });
});
