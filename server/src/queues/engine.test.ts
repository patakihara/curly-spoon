import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MediaRef, QueueItem, QueueType } from '@auralis/schema';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { itemSummarySchema, playSessionSchema } from '../adapters/audiobookshelf/schemas.js';
import { recordingSchema } from '../adapters/http/recording.js';
import { indexQueryResultSchema } from '../adapters/jellyfin/schemas.js';
import type { QueueEntry, SessionValue } from '../store/listening.js';
import {
  add,
  defaultAction,
  setQueueStyle,
  step,
  switchTo,
  type EngineDeps,
  type Expansion,
} from './engine.js';

const ADAPTERS = fileURLToPath(new URL('../adapters/', import.meta.url));

function recordedJson(upstream: 'audiobookshelf' | 'jellyfin', call: string): unknown {
  const file = join(ADAPTERS, upstream, 'recordings', `${call}.json`);
  const { response } = recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  if (response.body === null || !('json' in response.body)) throw new Error(call);
  return response.body.json;
}

/** A recorded album's tracks, in the order the index plays them. */
function recordedAlbum(call: string): { album: MediaRef; tracks: MediaRef[] } {
  const { Items } = indexQueryResultSchema.parse(recordedJson('jellyfin', call));
  const albumId = Items[0]?.AlbumId;
  if (albumId == null) throw new Error(call);
  return {
    album: { source: 'jellyfin', id: albumId },
    tracks: Items.map((t) => ({ source: 'jellyfin' as const, id: t.Id })),
  };
}

const first = recordedAlbum('index-album-tracks-1');
const second = recordedAlbum('index-album-tracks-2');
const [trackX, trackY] = [second.tracks[0]!, second.tracks[1]!];

const show2 = itemSummarySchema.parse(recordedJson('audiobookshelf', 'index-show-2'));
if (show2.mediaType !== 'podcast') throw new Error('index-show-2 is a show');
const show: MediaRef = { source: 'abs', id: show2.id };
const episodes: MediaRef[] = show2.media.episodes.map((e) => ({ source: 'abs', id: e.id }));
const [episodeE, episodeF] = [episodes[0]!, episodes[1]!];

const played = playSessionSchema
  .extend({ libraryItemId: z.string() })
  .parse(recordedJson('audiobookshelf', 'item-play'));
const book: MediaRef = { source: 'abs', id: played.libraryItemId };
const chapterCount = played.chapters?.length ?? 0;

const key = (ref: MediaRef) => `${ref.source}:${ref.id}`;

/** The index lookup, over the recordings. */
const index = new Map<string, Expansion>([
  ...[first, second].map(({ album, tracks }): [string, Expansion] => [
    key(album),
    { kind: 'album', entries: tracks.map((ref) => ({ ref })), from: { kind: 'album', ref: album } },
  ]),
  ...second.tracks.map((ref): [string, Expansion] => [
    key(ref),
    { kind: 'track', entries: [{ ref }], from: null },
  ]),
  ...first.tracks.map((ref): [string, Expansion] => [
    key(ref),
    { kind: 'track', entries: [{ ref }], from: null },
  ]),
  ...episodes.map((ref): [string, Expansion] => [
    key(ref),
    { kind: 'episode', entries: [{ ref }], from: { kind: 'show', ref: show } },
  ]),
  [
    key(book),
    {
      kind: 'book',
      entries: Array.from({ length: chapterCount }, (_, chapter) => ({ ref: book, chapter })),
      from: { kind: 'book', ref: book },
    },
  ],
]);

function deps(autoplay: EngineDeps['autoplay'] = () => null): EngineDeps {
  let id = 0;
  let clock = 1000;
  return {
    expand: (ref) => index.get(key(ref)) ?? null,
    autoplay,
    newId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`,
    now: () => (clock += 1000),
  };
}

const empty = (queueStyle: SessionValue['queueStyle'] = 'youtube'): SessionValue => ({
  active: 'music',
  switchAfterCurrent: null,
  queueStyle,
  queues: {
    music: { current: null, position: null, user: [], context: null },
    spoken: { current: null, position: null, user: [], context: null },
  },
  history: [],
  autoplay: { music: null, spoken: null },
  radio: null,
  autoplayAt: null,
});

/** Runs each change in turn, failing on a ref the index does not hold. */
function run(session: SessionValue, ...changes: ((s: SessionValue) => SessionValue | null)[]) {
  return changes.reduce((s, change) => {
    const next = change(s);
    if (next === null) throw new Error('the index does not hold that ref');
    return next;
  }, session);
}

const refOf = (item: QueueItem | null) =>
  item === null
    ? null
    : item.chapter === undefined
      ? item.ref
      : { ...item.ref, chapter: item.chapter };
const refs = (items: readonly QueueItem[]) => items.map(refOf);
const order = (s: SessionValue, queue: QueueType) => [
  refOf(s.queues[queue].current),
  ...refs(s.queues[queue].user),
  ...refs(s.queues[queue].context?.items ?? []),
];

describe('[M1.sessions/b] the music and spoken queues', () => {
  it('advance independently, and the meta-queue switch changes which one the controls drive', () => {
    const d = deps();
    let s = run(
      empty(),
      (s) => add(s, first.album, 'now', d),
      (s) => add(s, episodeE, 'end', d),
      (s) => add(s, episodeF, 'end', d),
    );
    expect(s.active).toBe('music');
    expect(s.queues.spoken.current).toBeNull();

    s = step(s, 'next', d);
    expect(refOf(s.queues.music.current)).toEqual(first.tracks[1]);
    expect(refs(s.queues.spoken.user)).toEqual([episodeE, episodeF]);

    s = switchTo(s, 'spoken', d);
    expect(s.active).toBe('spoken');
    expect(refOf(s.queues.spoken.current)).toEqual(episodeE);
    expect(refOf(s.queues.music.current)).toEqual(first.tracks[1]);

    s = step(s, 'next', d);
    expect(refOf(s.queues.spoken.current)).toEqual(episodeF);
    expect(refOf(s.queues.music.current)).toEqual(first.tracks[1]);
    expect(refs(s.queues.music.user)).toEqual(first.tracks.slice(2));

    s = switchTo(s, 'music', d);
    s = step(s, 'next', d);
    expect(refOf(s.queues.music.current)).toEqual(first.tracks[2]);
    expect(refOf(s.queues.spoken.current)).toEqual(episodeF);
  });

  it('plays an episode put next during a song right after that song, then on the spoken queue', () => {
    const d = deps();
    let s = run(
      empty(),
      (s) => add(s, first.album, 'now', d),
      (s) => add(s, episodeE, 'next', d),
    );
    expect(s.active).toBe('music');
    expect(refOf(s.queues.music.current)).toEqual(first.tracks[0]);
    expect(s.switchAfterCurrent).toBe('spoken');

    s = step(s, 'next', d);

    expect(s.active).toBe('spoken');
    expect(refOf(s.queues.spoken.current)).toEqual(episodeE);
    expect(s.history.map((h) => h.ref)).toEqual([first.tracks[0]]);
    expect(s.switchAfterCurrent).toBeNull();
    expect(order(s, 'music')).toEqual([null, ...first.tracks.slice(1)]);
  });

  it('pauses, not clears, the other queue when one starts, and keeps a paused episode queued', () => {
    const d = deps();
    let s = run(
      empty(),
      (s) => add(s, episodeE, 'now', d),
      (s) => add(s, first.album, 'now', d),
    );
    expect(s.active).toBe('music');
    expect(refOf(s.queues.spoken.current)).toEqual(episodeE);

    s = run(s, (s) => add(s, episodeF, 'next', d));
    s = step(s, 'next', d);

    expect(refOf(s.queues.spoken.current)).toEqual(episodeF);
    expect(refs(s.queues.spoken.user)).toEqual([episodeE]);
  });

  it("keeps a book put next on a paused queue whole, and the paused episode's place in it", () => {
    const d = deps();
    let s = run(empty(), (s) => add(s, episodeE, 'now', d));
    s = {
      ...s,
      queues: { ...s.queues, spoken: { ...s.queues.spoken, position: { ms: 61_000, takenAt: 5 } } },
    };
    s = run(
      s,
      (s) => add(s, first.album, 'now', d),
      (s) => add(s, book, 'next', d),
    );
    const chapters = Array.from({ length: chapterCount }, (_, chapter) => ({ ...book, chapter }));

    s = step(s, 'next', d);
    expect(order(s, 'spoken')).toEqual([...chapters, episodeE]);
    expect(s.queues.spoken.position).toBeNull();

    chapters.forEach(() => (s = step(s, 'next', d)));
    expect(refOf(s.queues.spoken.current)).toEqual(episodeE);
    expect(s.queues.spoken.position).toEqual({ ms: 61_000, takenAt: 5 });
  });

  it('starts autoplay when the switch lands on a queue with nothing left', () => {
    const d = deps((queue) => (queue === 'spoken' ? { ref: episodeF } : null));
    const s = switchTo(
      run(empty(), (s) => add(s, trackX, 'now', d)),
      'spoken',
      d,
    );

    expect(s.active).toBe('spoken');
    expect(refOf(s.queues.spoken.current)).toEqual(episodeF);
    expect(refOf(s.queues.music.current)).toEqual(trackX);
  });

  it('asks the injected autoplay for the queue that ran out, and stops when it has nothing', () => {
    const asked: QueueType[] = [];
    const next: QueueEntry = { ref: first.tracks[5]! };
    const d = deps((queue) => {
      asked.push(queue);
      return queue === 'music' ? next : null;
    });
    let s = run(empty(), (s) => add(s, trackX, 'now', d));

    s = step(s, 'next', d);
    expect(refOf(s.queues.music.current)).toEqual(first.tracks[5]);

    s = run(s, (s) => add(s, episodeE, 'now', d));
    s = step(s, 'next', d);
    expect(s.queues.spoken.current).toBeNull();
    expect(asked).toEqual(['music', 'spoken']);
  });
});

describe('[M1.sessions/c] Play next and Add to queue', () => {
  it('YouTube Music style: Play next right after the current item, Add to queue after everything', () => {
    const d = deps();
    const s = run(
      empty('youtube'),
      (s) => add(s, first.album, 'now', d),
      (s) => add(s, trackX, 'next', d),
      (s) => add(s, trackY, 'end', d),
    );

    expect(order(s, 'music')).toEqual([first.tracks[0], trackX, ...first.tracks.slice(1), trackY]);
    expect(s.queues.music.context).toEqual({
      from: { kind: 'album', ref: first.album },
      items: [],
    });
  });

  it('YouTube Music style: an album put next goes in whole, in order, ahead of the queue', () => {
    const d = deps();
    const s = run(
      empty('youtube'),
      (s) => add(s, trackX, 'now', d),
      (s) => add(s, trackY, 'end', d),
      (s) => add(s, first.album, 'next', d),
    );

    expect(order(s, 'music')).toEqual([trackX, ...first.tracks, trackY]);
  });

  it('YouTube Music style: Play on an album keeps the rest of the queue after it', () => {
    const d = deps();
    const s = run(
      empty('youtube'),
      (s) => add(s, trackX, 'now', d),
      (s) => add(s, trackY, 'end', d),
      (s) => add(s, first.album, 'now', d),
    );

    expect(order(s, 'music')).toEqual([...first.tracks, trackY]);
    expect(s.history.map((h) => h.ref)).toEqual([trackX]);
  });

  it('Spotify style: current, your queue with Play next at its front, then the playing-from album', () => {
    const d = deps();
    const s = run(
      empty('spotify'),
      (s) => add(s, first.album, 'now', d),
      (s) => add(s, trackY, 'end', d),
      (s) => add(s, trackX, 'next', d),
    );

    expect(refOf(s.queues.music.current)).toEqual(first.tracks[0]);
    expect(refs(s.queues.music.user)).toEqual([trackX, trackY]);
    expect(s.queues.music.context).toEqual({
      from: { kind: 'album', ref: first.album },
      items: expect.any(Array),
    });
    expect(order(s, 'music')).toEqual([first.tracks[0], trackX, trackY, ...first.tracks.slice(1)]);
  });

  it('Spotify style: playing on steps through your queue before the album', () => {
    const d = deps();
    let s = run(
      empty('spotify'),
      (s) => add(s, first.album, 'now', d),
      (s) => add(s, trackX, 'end', d),
    );

    s = step(s, 'next', d);
    expect(refOf(s.queues.music.current)).toEqual(trackX);
    s = step(s, 'next', d);
    expect(refOf(s.queues.music.current)).toEqual(first.tracks[1]);
  });

  it("Spotify style: Play on a second album plays from it, the first album's rest after it", () => {
    const d = deps();
    const s = run(
      empty('spotify'),
      (s) => add(s, first.album, 'now', d),
      (s) => add(s, trackX, 'end', d),
      (s) => add(s, second.album, 'now', d),
    );

    expect(refs(s.queues.music.user)).toEqual([trackX]);
    expect(s.queues.music.context?.from).toEqual({ kind: 'album', ref: second.album });
    expect(order(s, 'music')).toEqual([
      second.tracks[0],
      trackX,
      ...second.tracks.slice(1),
      ...first.tracks.slice(1),
    ]);
  });

  it('a style change to YouTube Music style folds what is left of the album into the queue', () => {
    const d = deps();
    const spotify = run(
      empty('spotify'),
      (s) => add(s, first.album, 'now', d),
      (s) => add(s, trackX, 'end', d),
    );

    const s = setQueueStyle(spotify, 'youtube');

    expect(s.queueStyle).toBe('youtube');
    expect(order(s, 'music')).toEqual(order(spotify, 'music'));
    expect(s.queues.music.context).toEqual({
      from: { kind: 'album', ref: first.album },
      items: [],
    });
  });
});

describe('[M1.sessions/d] Back and Forward', () => {
  it('Back returns to the previously played item across both queues, and Forward to the one it left', () => {
    const d = deps();
    let s = run(
      empty(),
      (s) => add(s, trackX, 'now', d),
      (s) => add(s, episodeE, 'next', d),
    );
    s = step(s, 'next', d);
    expect(refOf(s.queues.spoken.current)).toEqual(episodeE);

    s = step(s, 'back', d);
    expect(s.active).toBe('music');
    expect(refOf(s.queues.music.current)).toEqual(trackX);
    expect(refs(s.queues.spoken.user)[0]).toEqual(episodeE);
    expect(s.history.map((h) => h.ref)).toEqual([trackX]);

    s = step(s, 'next', d);
    expect(s.active).toBe('spoken');
    expect(refOf(s.queues.spoken.current)).toEqual(episodeE);
    expect(s.history.map((h) => h.ref)).toEqual([trackX]);
  });

  it('walks back several plays over both queues and forward again in the order they played', () => {
    const d = deps();
    let s = run(
      empty(),
      (s) => add(s, first.album, 'now', d),
      (s) => add(s, episodeE, 'next', d),
    );
    s = step(s, 'next', d);
    s = step(s, 'next', d);
    s = run(s, (s) => add(s, trackX, 'now', d));
    s = step(s, 'next', d);
    const walkedFrom = refOf(s.queues.music.current);
    expect(s.history.map((h) => h.ref)).toEqual([first.tracks[0], episodeE, trackX]);

    const backs = [1, 2, 3].map(() => (s = step(s, 'back', d)));
    expect(backs.map((b) => [b.active, refOf(b.queues[b.active].current)])).toEqual([
      ['music', trackX],
      ['spoken', episodeE],
      ['music', first.tracks[0]],
    ]);
    expect(step(s, 'back', d)).toEqual(s);

    const forwards = [1, 2, 3].map(() => (s = step(s, 'next', d)));
    expect(forwards.map((f) => [f.active, refOf(f.queues[f.active].current)])).toEqual([
      ['spoken', episodeE],
      ['music', trackX],
      ['music', walkedFrom],
    ]);
    expect(s.history.map((h) => h.ref)).toEqual([first.tracks[0], episodeE, trackX]);
  });

  it('never takes a play out of history, and a new play ends the walk', () => {
    const d = deps();
    let s = run(empty(), (s) => add(s, first.album, 'now', d));
    s = step(s, 'next', d);
    s = step(s, 'next', d);
    const history = s.history;

    s = step(s, 'back', d);
    s = step(s, 'back', d);
    expect(s.history).toEqual(history);

    s = run(s, (s) => add(s, trackX, 'now', d));
    expect(s.history).toEqual(history);
    expect(order(s, 'music')).toEqual([trackX, ...first.tracks.slice(1)]);

    s = step(s, 'next', d);
    expect(refOf(s.queues.music.current)).toEqual(first.tracks[1]);
    expect(s.history.map((h) => h.ref)).toEqual([...history.map((h) => h.ref), trackX]);
  });

  it('plays a song put next during a walk right after the replay, and records each play once', () => {
    const d = deps();
    let s = run(empty(), (s) => add(s, first.album, 'now', d));
    s = step(s, 'next', d);
    s = step(s, 'next', d);
    s = step(s, 'back', d);
    s = step(s, 'back', d);
    expect(refOf(s.queues.music.current)).toEqual(first.tracks[0]);

    s = run(s, (s) => add(s, trackX, 'next', d));
    const heard = [1, 2, 3].map(() => refOf((s = step(s, 'next', d)).queues.music.current));

    expect(heard).toEqual([trackX, first.tracks[1], first.tracks[2]]);
    s = step(s, 'next', d);
    expect(s.history.map((h) => h.ref)).toEqual([
      first.tracks[0],
      first.tracks[1],
      trackX,
      first.tracks[2],
    ]);
  });

  it('keeps a walk over both queues in order around a song put next, recording each play once', () => {
    const d = deps();
    let s = run(
      empty(),
      (s) => add(s, first.album, 'now', d),
      (s) => add(s, episodeE, 'next', d),
    );
    s = step(s, 'next', d);
    s = step(s, 'next', d);
    s = switchTo(s, 'music', d);
    s = step(s, 'next', d);
    expect(s.history.map((h) => h.ref)).toEqual([first.tracks[0], episodeE, first.tracks[1]]);
    [1, 2, 3].forEach(() => (s = step(s, 'back', d)));
    expect(refOf(s.queues.music.current)).toEqual(first.tracks[0]);

    s = step(s, 'next', d);
    expect(refOf(s.queues.spoken.current)).toEqual(episodeE);
    s = run(s, (s) => add(s, trackX, 'next', d));
    const heard = [1, 2, 3].map(() => {
      s = step(s, 'next', d);
      return [s.active, refOf(s.queues[s.active].current)];
    });

    expect(heard).toEqual([
      ['music', trackX],
      ['music', first.tracks[1]],
      ['music', first.tracks[2]],
    ]);
    s = step(s, 'next', d);
    expect(s.history.map((h) => h.ref)).toEqual([
      first.tracks[0],
      episodeE,
      first.tracks[1],
      trackX,
      first.tracks[2],
    ]);
  });

  it('Back retraces what actually played after a song put next during a walk', () => {
    const d = deps();
    let s = run(empty(), (s) => add(s, first.album, 'now', d));
    s = step(s, 'next', d);
    s = step(s, 'next', d);
    s = step(s, 'back', d);
    s = step(s, 'back', d);
    s = run(s, (s) => add(s, trackX, 'next', d));
    [1, 2, 3].forEach(() => (s = step(s, 'next', d)));
    expect(refOf(s.queues.music.current)).toEqual(first.tracks[2]);

    const backs = [1, 2, 3].map(() => refOf((s = step(s, 'back', d)).queues.music.current));

    expect(backs).toEqual([first.tracks[1], trackX, first.tracks[0]]);
    expect(step(s, 'back', d)).toEqual(s);
  });

  it('Back from a song played now during a walk returns to the replay it replaced', () => {
    const d = deps();
    let s = run(empty(), (s) => add(s, first.album, 'now', d));
    s = step(s, 'next', d);
    s = step(s, 'next', d);
    s = step(s, 'back', d);
    s = step(s, 'back', d);
    s = run(s, (s) => add(s, trackX, 'now', d));

    s = step(s, 'back', d);

    expect(refOf(s.queues.music.current)).toEqual(first.tracks[0]);
    expect(step(s, 'back', d)).toEqual(s);
  });

  it('Forward follows the queue: a walk reordered in the queue plays in its new order', () => {
    const d = deps();
    let s = run(empty(), (s) => add(s, first.album, 'now', d));
    s = step(s, 'next', d);
    s = step(s, 'next', d);
    s = step(s, 'back', d);
    s = step(s, 'back', d);
    const [walkA2, walkA3, ...rest] = s.queues.music.user;
    expect(refs([walkA2!, walkA3!])).toEqual([first.tracks[1], first.tracks[2]]);
    s = { ...s, queues: { ...s.queues, music: { ...s.queues.music } } };
    s.queues.music.user = [walkA3!, walkA2!, ...rest];

    const heard = [1, 2].map(() => refOf((s = step(s, 'next', d)).queues.music.current));

    expect(heard).toEqual([first.tracks[2], first.tracks[1]]);
    expect(refOf(step(s, 'back', d).queues.music.current)).toEqual(first.tracks[2]);
  });

  it('never records the replayed item again when the switch or Play now ends the walk', () => {
    const d = deps();
    let s = run(
      empty(),
      (s) => add(s, first.album, 'now', d),
      (s) => add(s, episodeE, 'next', d),
    );
    s = step(s, 'next', d);
    s = step(s, 'next', d);
    s = run(s, (s) => add(s, trackX, 'now', d));
    s = step(s, 'back', d);
    s = step(s, 'back', d);
    expect(refOf(s.queues.music.current)).toEqual(first.tracks[0]);
    const history = s.history.map((h) => h.ref);
    expect(history).toEqual([first.tracks[0], episodeE]);

    const switched = step(switchTo(switchTo(s, 'spoken', d), 'music', d), 'next', d);
    expect(switched.history.map((h) => h.ref)).toEqual(history);

    s = run(s, (s) => add(s, episodeF, 'now', d));
    s = switchTo(s, 'music', d);
    s = step(s, 'next', d);
    expect(refOf(s.queues.music.current)).toEqual(trackX);
    expect(s.history.map((h) => h.ref)).toEqual(history);
  });
});

describe('[M1.sessions/c] default button actions', () => {
  const d = deps();
  const musicPlaying = run(empty(), (s) => add(s, trackX, 'now', d));
  const spokenPlaying = run(empty(), (s) => add(s, episodeE, 'now', d));

  it('plays a song next and puts an album at the end while music plays', () => {
    expect(defaultAction(musicPlaying, 'track')).toBe('next');
    expect(defaultAction(musicPlaying, 'album')).toBe('end');
  });

  it('starts playback from any item when nothing is playing', () => {
    for (const kind of ['track', 'album', 'episode', 'book'] as const) {
      expect(defaultAction(empty(), kind)).toBe('now');
    }
    const idle = run(empty(), (s) => add(s, first.album, 'default', deps()));
    expect(order(idle, 'music')).toEqual(first.tracks);
    expect(refOf(idle.queues.music.current)).toEqual(first.tracks[0]);
  });

  it('plays music now while a podcast or book is playing', () => {
    expect(defaultAction(spokenPlaying, 'track')).toBe('now');
    expect(defaultAction(spokenPlaying, 'album')).toBe('now');
  });

  it('plays an episode or a book next while something plays', () => {
    for (const kind of ['episode', 'book'] as const) {
      expect(defaultAction(musicPlaying, kind)).toBe('next');
      expect(defaultAction(spokenPlaying, kind)).toBe('next');
    }
  });

  it('applies them through add: a book enters as its chapters, played now when idle', () => {
    const idle = run(empty(), (s) => add(s, book, 'default', deps()));
    expect(idle.active).toBe('spoken');
    expect(order(idle, 'spoken')).toEqual(
      Array.from({ length: chapterCount }, (_, chapter) => ({ ...book, chapter })),
    );

    const busy = run(musicPlaying, (s) => add(s, episodeE, 'default', deps()));
    expect(busy.active).toBe('music');
    expect(refs(busy.queues.spoken.user)).toEqual([episodeE]);
    expect(busy.switchAfterCurrent).toBe('spoken');

    const songDuringSpoken = run(spokenPlaying, (s) => add(s, trackX, 'default', deps()));
    expect(songDuringSpoken.active).toBe('music');
    expect(refOf(songDuringSpoken.queues.music.current)).toEqual(trackX);
    expect(refOf(songDuringSpoken.queues.spoken.current)).toEqual(episodeE);
  });

  it('adds nothing for a ref the index does not hold', () => {
    expect(add(empty(), { source: 'abs', id: 'not-indexed' }, 'default', deps())).toBeNull();
  });
});
