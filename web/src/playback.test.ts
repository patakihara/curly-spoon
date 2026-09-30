import { describe, expect, it } from 'vitest';
import { createApiClient } from './api/client';
import { type MediaLike, type PlaybackPlan, HLS_MIME, createPlayer } from './playback';

/** An audio element stand-in: the test moves its clock and fires what a browser would. */
class FakeAudio implements MediaLike {
  src = '';
  preload = '';
  currentTime = 0;
  duration = Number.NaN;
  paused = true;
  loads = 0;
  native = '';
  private listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  /** How many listeners the engine still holds on this element. */
  listening() {
    return [...this.listeners.values()].reduce((n, set) => n + set.size, 0);
  }
  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }
  fire(type: string) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }
  canPlayType(type: string) {
    return type === this.native ? 'maybe' : '';
  }
  load() {
    this.loads++;
  }
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
  async play() {
    this.paused = false;
    this.fire('playing');
  }
  pause() {
    this.paused = true;
  }
  /** The file's length once its metadata is in. */
  loaded(duration: number) {
    this.duration = duration;
    this.fire('loadedmetadata');
  }
  /** Plays on to `time` seconds into its file. */
  at(time: number) {
    this.currentTime = time;
    this.fire('timeupdate');
  }
  finish() {
    this.currentTime = this.duration;
    this.paused = true;
    this.fire('ended');
  }
}

const book: PlaybackPlan = {
  tracks: [
    { url: '/api/media/abs:b/tracks/0', mime: 'audio/mpeg', duration: 21, offset: 0 },
    { url: '/api/media/abs:b/tracks/1', mime: 'audio/mpeg', duration: 62, offset: 21 },
    { url: '/api/media/abs:b/tracks/2', mime: 'audio/mpeg', duration: 41, offset: 83 },
  ],
  chapters: [],
  startAt: 0,
};

function rig(plan: PlaybackPlan, options: { native?: string; hlsArrives?: Promise<void> } = {}) {
  const audios: FakeAudio[] = [];
  const positions: number[] = [];
  const hls: { source?: string; media?: MediaLike; destroyed: boolean }[] = [];
  const requests: string[] = [];
  let ended = 0;
  const player = createPlayer(plan, {
    api: createApiClient({
      baseUrl: 'http://auralis.test',
      fetch: async (request) => {
        requests.push(`${request.method} ${new URL(request.url).pathname}`);
        return Response.json({ ok: true });
      },
    }),
    createAudio: () => {
      const audio = new FakeAudio();
      audio.native = options.native ?? '';
      audios.push(audio);
      return audio;
    },
    loadHls: async () => {
      await options.hlsArrives;
      return class {
        state: (typeof hls)[number] = { destroyed: false };
        constructor() {
          hls.push(this.state);
        }
        loadSource(url: string) {
          this.state.source = url;
        }
        attachMedia(media: MediaLike) {
          this.state.media = media;
        }
        destroy() {
          this.state.destroyed = true;
        }
      };
    },
    onPosition: (position) => positions.push(position),
    onEnded: () => ended++,
  });
  const playing = () => audios.find((a) => !a.paused);
  return { player, audios, positions, hls, requests, playing, ended: () => ended };
}

describe('the web player', () => {
  it('[M1.play/c] starts the file that holds the plan’s start, at that point in the file', async () => {
    const { player, playing } = rig({ ...book, startAt: 30 });
    await player.play();
    expect(playing()?.src).toBe('/api/media/abs:b/tracks/1');
    expect(playing()?.currentTime).toBe(9);
    expect(player.position).toBe(30);
  });

  it('[M1.play/c] reports the position in the whole item: the file’s offset plus its own time', async () => {
    const { player, playing, positions } = rig({ ...book, startAt: 21 });
    await player.play();
    playing()!.at(12.5);
    expect(player.position).toBe(33.5);
    expect(positions.at(-1)).toBe(33.5);
  });

  it('[M1.play/c] preloads the next file 20 seconds before the end of a long one, not sooner', async () => {
    const { player, audios, playing } = rig({ ...book, startAt: 21 });
    await player.play();
    const current = playing()!;
    current.loaded(62);
    current.at(41.5);
    const other = audios.find((a) => a !== current);
    expect(other?.src ?? '').toBe('');
    current.at(42);
    const next = audios.find((a) => a !== current)!;
    expect(next.src).toBe('/api/media/abs:b/tracks/2');
    expect(next.preload).toBe('auto');
    expect(next.loads).toBe(1);
    expect(next.paused).toBe(true);
  });

  it('[M1.play/c] preloads a short file’s successor halfway through it', async () => {
    const { player, audios, playing } = rig(book);
    await player.play();
    const current = playing()!;
    current.loaded(5);
    current.at(2.4);
    expect(audios.filter((a) => a.src !== '')).toHaveLength(1);
    current.at(2.5);
    expect(audios.map((a) => a.src)).toContain('/api/media/abs:b/tracks/1');
  });

  it('[M1.play/c] starts the preloaded next file the moment one ends, and the position runs on from its offset', async () => {
    const { player, audios, playing, positions } = rig(book);
    await player.play();
    const first = playing()!;
    first.loaded(21);
    first.at(10);
    const second = audios.find((a) => a !== first)!;
    first.at(20.9);
    first.finish();
    expect(playing()).toBe(second);
    expect(second.src).toBe('/api/media/abs:b/tracks/1');
    expect(second.loads).toBe(1);
    second.at(0.5);
    expect(player.position).toBe(21.5);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('[M1.play/c] plays on from the second element into the third file with the first element again', async () => {
    const { player, playing } = rig(book);
    await player.play();
    const first = playing()!;
    first.loaded(21);
    first.at(20);
    first.finish();
    const second = playing()!;
    second.loaded(62);
    second.at(61);
    second.finish();
    expect(playing()).toBe(first);
    expect(first.src).toBe('/api/media/abs:b/tracks/2');
    expect(first.currentTime).toBe(0);
    first.at(1);
    expect(player.position).toBe(84);
  });

  it('[M1.play/c] loads the next file at the end when it was never preloaded', async () => {
    const { player, playing } = rig(book);
    await player.play();
    const first = playing()!;
    first.finish();
    await new Promise((resolve) => setTimeout(resolve));
    expect(playing()?.src).toBe('/api/media/abs:b/tracks/1');
  });

  it('[M1.play/c] stops after the last file and says so', async () => {
    const { player, playing, ended } = rig({ ...book, startAt: 90 });
    await player.play();
    playing()!.finish();
    expect(playing()).toBeUndefined();
    expect(ended()).toBe(1);
  });

  it('[M1.play/c] seeks into another file by loading it where the seek lands', async () => {
    const { player, playing } = rig(book);
    await player.play();
    await player.seek(100);
    expect(playing()?.src).toBe('/api/media/abs:b/tracks/2');
    expect(playing()?.currentTime).toBe(17);
    expect(player.position).toBe(100);
  });

  it('[M1.play/c] seeks within the playing file without reloading it', async () => {
    const { player, playing } = rig(book);
    await player.play();
    const first = playing()!;
    await player.seek(7);
    expect(playing()).toBe(first);
    expect(first.loads).toBe(1);
    expect(first.currentTime).toBe(7);
  });

  it('[M1.play/c] pauses the playing file and resumes it where it was', async () => {
    const { player, audios, playing } = rig(book);
    await player.play();
    const first = playing()!;
    first.at(4);
    player.pause();
    expect(audios.every((a) => a.paused)).toBe(true);
    await player.play();
    expect(playing()).toBe(first);
    expect(player.position).toBe(4);
  });

  const transcode: PlaybackPlan = {
    tracks: [
      { url: '/api/media/abs:b/hls/p1/output.m3u8', mime: HLS_MIME, duration: 168, offset: 0 },
    ],
    chapters: [],
    startAt: 0,
    progressTarget: { playId: 'p1' },
  };

  it('[M1.play/c] plays a transcode through hls.js where the browser has no HLS of its own', async () => {
    const { player, playing, hls } = rig(transcode);
    await player.play();
    expect(hls).toHaveLength(1);
    expect(hls[0]!.source).toBe('/api/media/abs:b/hls/p1/output.m3u8');
    expect(hls[0]!.media).toBe(playing());
    player.destroy();
    expect(hls[0]!.destroyed).toBe(true);
  });

  it('[M1.play/c] gives a transcode to the browser directly where it plays HLS itself', async () => {
    const { player, playing, hls } = rig(transcode, { native: HLS_MIME });
    await player.play();
    expect(hls).toHaveLength(0);
    expect(playing()?.src).toBe('/api/media/abs:b/hls/p1/output.m3u8');
  });

  it('[M1.play/c] closes a transcode’s playback session when done with it, ending the transcode', async () => {
    const { player, requests } = rig(transcode);
    await player.play();
    expect(requests).toEqual([]);
    await player.destroy();
    expect(requests).toEqual(['POST /api/play/p1/close']);
  });

  it('[M1.play/c] lets go of both files when destroyed, with no session left to close on direct play', async () => {
    const { player, audios, playing, requests } = rig(book);
    await player.play();
    playing()!.loaded(21);
    playing()!.at(19);
    await player.destroy();
    expect(audios.every((a) => a.paused && a.src === '')).toBe(true);
    expect(requests).toEqual([]);
  });

  it('[M1.play/c] does nothing with hls.js that arrives after the player is destroyed', async () => {
    let arrive!: () => void;
    const hlsArrives = new Promise<void>((resolve) => (arrive = resolve));
    const { player, audios, hls } = rig(transcode, { hlsArrives });
    const playing = player.play();
    await player.destroy();
    arrive();
    await playing;
    expect(hls).toHaveLength(0);
    expect(audios.every((a) => a.paused && a.src === '')).toBe(true);
  });

  it('[M1.play/c] never starts a next file that was still loading when the player was destroyed', async () => {
    const { player, audios, playing } = rig(book);
    await player.play();
    playing()!.finish();
    await player.destroy();
    await new Promise((resolve) => setTimeout(resolve));
    expect(audios.every((a) => a.paused)).toBe(true);
  });

  it('[M1.play/c] stops listening to both elements once destroyed', async () => {
    const { player, audios, positions } = rig(book);
    await player.play();
    await player.destroy();
    expect(audios.map((a) => a.listening())).toEqual([0, 0]);
    audios[0]!.at(3);
    expect(positions).toEqual([]);
  });

  it('[M1.play/c] closes the transcode’s session once, however often it is destroyed', async () => {
    const { player, requests } = rig(transcode);
    await player.play();
    await Promise.all([player.destroy(), player.destroy()]);
    await player.destroy();
    expect(requests).toEqual(['POST /api/play/p1/close']);
  });

  it('[M1.play/c] plays nothing when asked to after being destroyed', async () => {
    const { player, audios } = rig(book);
    await player.destroy();
    await player.play();
    expect(audios.every((a) => a.paused && a.src === '')).toBe(true);
  });

  it('[M1.play/c] moves nowhere when asked to seek after being destroyed', async () => {
    const { player, audios } = rig(book);
    await player.play();
    await player.destroy();
    await player.seek(100);
    expect(audios.every((a) => a.paused && a.src === '')).toBe(true);
  });
});
