/**
 * Turns an album's Jellyfin tracks into the same cumulative-`startOffset` timeline
 * `playerStore`/`useAudioElement` already know how to play through for a multi-file
 * audiobook — see `AudioTrack`'s own doc comment in `api/types.ts`. That reuse is
 * deliberate: it is the entire "queue" this wave adds. Playing track 3 of an album and
 * having it continue into track 4 needs no separate queue concept in the player at all,
 * only tracks laid out end to end on one timeline, exactly as a book split across several
 * files already is.
 *
 * A fuller queue — shuffle, repeat, skipping across albums, mixing sources — cannot be
 * expressed this way: shuffle in particular breaks the assumption `trackAt`/`nextTrack`
 * both rely on, that `tracks` is already in the order it plays in. That would need an
 * explicit ordered play-list decoupled from `startOffset`, not a bigger version of this.
 */
import type { AudioTrack, JellyfinTrack } from '../../api/types.js';

export interface AlbumQueue {
  audioTracks: AudioTrack[];
  duration: number;
}

/**
 * `durationSeconds` can be `null` (an upstream gap, same as everywhere else in this app) —
 * a track with an unknown duration contributes zero seconds to the timeline rather than
 * poisoning every later track's `startOffset` with `NaN`. It plays, just without the
 * scrubber being able to seek past its own end accurately.
 */
export function albumQueue(tracks: JellyfinTrack[]): AlbumQueue {
  let cumulative = 0;
  const audioTracks: AudioTrack[] = tracks.map((track, index) => {
    const duration = track.durationSeconds ?? 0;
    const audioTrack: AudioTrack = {
      index,
      startOffset: cumulative,
      duration,
      title: track.name,
      // Opaque per-source token, not a URL — see `AudioTrack.contentUrl`'s doc comment and
      // `jellyfinSource` in `features/player/playbackSource.ts`, which is what reads it back.
      contentUrl: track.id,
      mimeType: null,
    };
    cumulative += duration;
    return audioTrack;
  });
  return { audioTracks, duration: cumulative };
}
