import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MediaRef, QueueItem, QueueType } from '@auralis/schema';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { itemSummarySchema, playSessionSchema } from '../adapters/audiobookshelf/schemas.js';
import { recordingSchema } from '../adapters/http/recording.js';
import { indexQueryResultSchema } from '../adapters/jellyfin/schemas.js';
import type { SessionValue } from '../store/listening.js';
import {
  add,
  defaultAction,
  setQueueStyle,
  step,
  switchTo,
  type EngineDeps,
  type Expansion,
  type QueueEntry,
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
  [
    key(first.album),
    {
      kind: 'album',
      entries: first.tracks.map((ref) => ({ ref })),
      from: { kind: 'album', ref: first.album },
    },
  ],
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
  historyCursor: null,
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

    s = switchTo(s, 'spoken');
    expect(s.active).toBe('spoken');
    expect(refOf(s.queues.spoken.current)).toEqual(episodeE);
    expect(refOf(s.queues.music.current)).toEqual(first.tracks[1]);

    s = step(s, 'next', d);
    expect(refOf(s.queues.spoken.current)).toEqual(episodeF);
    expect(refOf(s.queues.music.current)).toEqual(first.tracks[1]);
    expect(refs(s.queues.music.user)).toEqual(first.tracks.slice(2));

    s = switchTo(s, 'music');
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
    expect(s.historyCursor).toBeNull();
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
    expect(s.historyCursor).toBeNull();
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
    expect(s.historyCursor).toEqual({ back: 2, resumeQueue: 'music' });

    s = run(s, (s) => add(s, trackX, 'now', d));
    expect(s.historyCursor).toBeNull();
    expect(s.history).toEqual(history);
    expect(order(s, 'music')).toEqual([trackX, ...first.tracks.slice(1)]);
  });
});

describe('default button actions', () => {
  const d = deps();
  const musicPlaying = run(empty(), (s) => add(s, trackX, 'now', d));
  const spokenPlaying = run(empty(), (s) => add(s, episodeE, 'now', d));

  it('plays a song next and puts an album at the end, while music or nothing plays', () => {
    for (const s of [empty(), musicPlaying]) {
      expect(defaultAction(s, 'track')).toBe('next');
      expect(defaultAction(s, 'album')).toBe('end');
    }
  });

  it('plays music now while a podcast or book is playing', () => {
    expect(defaultAction(spokenPlaying, 'track')).toBe('now');
    expect(defaultAction(spokenPlaying, 'album')).toBe('now');
  });

  it('plays an episode or a book now when nothing is playing, otherwise next', () => {
    for (const kind of ['episode', 'book'] as const) {
      expect(defaultAction(empty(), kind)).toBe('now');
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
