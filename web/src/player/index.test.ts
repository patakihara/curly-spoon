import { type MediaRef, type PlaybackPlan } from '@auralis/schema';
import { describe, expect, it } from 'vitest';
import { placeholder } from '../generated/nav/playing';
import { listPlayOf, playingOf, playOf } from './index';
import { type PlayerState, type PlayerStore } from './store';

/** A store stand-in: its state, and each call made on it. */
function fakeStore(state: PlayerState) {
  const calls: string[] = [];
  const store: PlayerStore = {
    subscribe: () => () => undefined,
    getState: () => state,
    play: async (ref) => void calls.push(`play ${ref.source}:${ref.id}`),
    playList: async (id, start) =>
      void calls.push(
        `list ${id}${start === undefined ? '' : ` from ${start.source}:${start.id}`}`,
      ),
    restore: async () => void calls.push('restore'),
    queueNext: async (ref, queue) => void calls.push(`next ${ref.source}:${ref.id} ${queue}`),
    resume: async () => void calls.push('resume'),
    pause: async () => void calls.push('pause'),
    seek: async (to) => void calls.push(`seek ${to}`),
    skip: async (s) => void calls.push(`skip ${s}`),
    step: async (d) => void calls.push(`step ${d}`),
    cycleSpeed: () => void calls.push('speed'),
    cycleSleep: () => void calls.push('sleep'),
  };
  return { store, calls };
}

const planOf = (variant: 'spoken' | 'music', art: string | null): PlaybackPlan => ({
  meta: { title: 'The Salt Road', sub: null, art, variant },
  tracks: [{ url: '/api/media/abs:b/tracks/0', mime: 'audio/mpeg', duration: 600, offset: 0 }],
  chapters: [],
  startAt: 0,
  progressTarget: { playId: 'p' },
});

const loaded = (variant: 'spoken' | 'music', art: string | null = null): PlayerState => ({
  ref: { source: 'abs', id: 'b' },
  plan: planOf(variant, art),
  position: 150,
  duration: 600,
  playing: true,
  speed: 1.5,
  sleep: '15 min',
  restored: true,
});

const IDLE: PlayerState = {
  ref: null,
  plan: null,
  position: 0,
  duration: 0,
  playing: false,
  speed: 1,
  sleep: 'Off',
  restored: true,
};

const handlers = (p: object) =>
  Object.entries(p)
    .filter(([key, value]) => key.startsWith('on') && typeof value === 'function')
    .map(([key]) => key)
    .sort();

describe('[M1.shell] what the player shows', () => {
  it('[M1.shell] shows nothing while nothing is loaded', () => {
    const { store } = fakeStore(IDLE);
    expect(playingOf(IDLE, store, false)).toBeNull();
  });

  it('[M1.shell] shows the canvas’s picture, every control disabled, on a server nobody can sign in to', () => {
    const { store } = fakeStore(IDLE);
    const shown = playingOf(IDLE, store, true)!;
    expect(shown.title).toBe(placeholder.title);
    expect(handlers(shown)).toEqual([]);
  });

  it('[M1.shell] shows what is loaded, on the canvas too', () => {
    const { store } = fakeStore(loaded('spoken'));
    expect(playingOf(loaded('spoken'), store, true)!.title).toBe('The Salt Road');
  });

  it('[M1.shell] names a book or episode by its plan, where it is, its speed and its sleep timer', () => {
    const { store } = fakeStore(loaded('spoken', '/api/media/abs:b/art'));
    const shown = playingOf(loaded('spoken', '/api/media/abs:b/art'), store, false)!;
    expect(shown).toMatchObject({
      title: 'The Salt Road',
      artist: '',
      image: '/api/media/abs:b/art',
      variant: 'spoken',
      progress: 0.25,
      duration: 600,
      playing: true,
      speed: 1.5,
      sleep: '15 min',
    });
  });

  it('[M1.shell] shows no art where its plan has none', () => {
    const { store } = fakeStore(loaded('music'));
    expect(playingOf(loaded('music'), store, false)!.image).toBe('');
  });

  it('[M1.shell] gives a book or episode play, seek, skip, speed and sleep, and music previous and next instead', () => {
    const { store } = fakeStore(loaded('spoken'));
    expect(handlers(playingOf(loaded('spoken'), store, false)!)).toEqual([
      'onSeek',
      'onSkipBack',
      'onSkipForward',
      'onSleep',
      'onSpeed',
      'onTogglePlay',
    ]);
    expect(handlers(playingOf(loaded('music'), store, false)!)).toEqual([
      'onNext',
      'onPrev',
      'onSeek',
      'onSleep',
      'onTogglePlay',
    ]);
  });

  it('[M1.shell] drives the store with each control', () => {
    const { store, calls } = fakeStore(loaded('spoken'));
    const spoken = playingOf(loaded('spoken'), store, false)!;
    spoken.onTogglePlay!();
    spoken.onSkipBack!();
    spoken.onSkipForward!();
    spoken.onSeek!(0.5);
    spoken.onSpeed!();
    spoken.onSleep!();
    const music = playingOf(loaded('music'), store, false)!;
    music.onPrev!();
    music.onNext!();
    expect(calls).toEqual([
      'pause',
      'skip -15',
      'skip 15',
      'seek 300',
      'speed',
      'sleep',
      'step back',
      'step next',
    ]);
  });

  it('[M1.shell] names music by the song playing, its seek bar spanning only that song', () => {
    const album: PlaybackPlan = {
      ...planOf('music', null),
      meta: { title: 'Rumours', sub: 'Fleetwood Mac', art: null, variant: 'music' },
      tracks: [
        {
          url: '/api/media/jellyfin:a/tracks/0',
          mime: 'audio/flac',
          duration: 200,
          offset: 0,
          title: 'Dreams',
        },
        {
          url: '/api/media/jellyfin:b/tracks/0',
          mime: 'audio/flac',
          duration: 400,
          offset: 200,
          title: 'Songbird',
          sub: 'Christine McVie',
        },
      ],
    };
    const state: PlayerState = { ...loaded('music'), plan: album, position: 300, duration: 600 };
    const { store, calls } = fakeStore(state);
    const shown = playingOf(state, store, false)!;
    expect(shown).toMatchObject({
      title: 'Songbird',
      artist: 'Christine McVie',
      progress: 0.25,
      duration: 400,
    });
    shown.onSeek!(0.5);
    expect(calls).toEqual(['seek 400']);
    const first = playingOf({ ...state, position: 50 }, store, false)!;
    expect(first).toMatchObject({ title: 'Dreams', artist: 'Fleetwood Mac', progress: 0.25 });
  });

  it('[M1.shell] keeps the same handlers from one change to the next', () => {
    const { store } = fakeStore(loaded('spoken'));
    expect(playingOf(loaded('spoken'), store, false)!.onSeek).toBe(
      playingOf({ ...loaded('spoken'), position: 300 }, store, false)!.onSeek,
    );
  });
});

describe('[M1.shell] Play', () => {
  const ref: MediaRef = { source: 'abs', id: 'book-1' };

  it('[M1.shell] has no handler for a ref that names no playable item, so its Play stays disabled', () => {
    const { store } = fakeStore(IDLE);
    expect(playOf(store)('shadows-and-sighs', 'spoken', 'now')).toBeUndefined();
    expect(playOf(store)('', 'music', 'now')).toBeUndefined();
  });

  it('[M1.shell] plays an item now, or from its source, and puts it next in its queue', () => {
    const { store, calls } = fakeStore(IDLE);
    const play = playOf(store);
    play('abs:book-1', 'spoken', 'now')!();
    play('abs:book-1', 'spoken', 'source')!();
    play(`${ref.source}:${ref.id}`, 'spoken', 'next')!();
    expect(calls).toEqual(['play abs:book-1', 'play abs:book-1', 'next abs:book-1 spoken']);
  });
});

describe("[M2.lists] a list page's Play", () => {
  it('[M2.lists] plays the list through its own route, and its entries from where they stand on it', () => {
    const { store, calls } = fakeStore(IDLE);
    const play = listPlayOf(store, 'list-1');
    play('list-1', 'spoken', 'source')!();
    play('abs:ep-2', 'spoken', 'now')!();
    expect(calls).toEqual(['list list-1', 'list list-1 from abs:ep-2']);
  });

  it('[M2.lists] offers no Play next of the list itself, and puts an entry next as anywhere else', () => {
    const { store, calls } = fakeStore(IDLE);
    const play = listPlayOf(store, 'list-1');
    expect(play('list-1', 'spoken', 'next')).toBeUndefined();
    play('abs:ep-2', 'spoken', 'next')!();
    expect(calls).toEqual(['next abs:ep-2 spoken']);
  });

  it('[M2.lists] has no Play while the list has not loaded, nor for a ref that names nothing', () => {
    const { store } = fakeStore(IDLE);
    expect(listPlayOf(store, 'list-1')('', 'spoken', 'source')).toBeUndefined();
    expect(listPlayOf(store, 'list-1')('nothing', 'spoken', 'now')).toBeUndefined();
  });
});
