/**
 * The one `<audio>` element the whole player shares — created once with `new
 * Audio()` rather than rendered into the tree, since an `HTMLAudioElement` plays
 * perfectly well detached from the DOM and this avoids every component that
 * touches playback needing a ref threaded down to it.
 *
 * `playerStore`'s `currentTime` is the *source of truth* the UI renders from,
 * not a mirror of `audio.currentTime`: every explicit seek (`seek`, `skip`, a
 * chapter click) sets the store synchronously, and the elapsed/remaining labels
 * read the store directly. `timeupdate` only flows the other way (audio → store)
 * as a slow, throttled nudge — real playback keeping the display honest between
 * explicit seeks. This split matters because this app's e2e fixture audio is
 * synthetic byte noise with an audio-ish `Content-Type` but no valid container
 * structure, so real browsers reject it (`play()` rejects, `timeupdate` never
 * fires) — every user-facing interaction this player supports (seek, skip,
 * chapters, speed, sleep timer, bookmarks) must work from store state alone,
 * never depend on the element actually decoding anything.
 */
import { useEffect, useRef } from 'react';
import { useApi } from '../../api/ApiContext.js';
import { usePlayerStore } from '../../state/playerStore.js';
import { fileIdFromContentUrl, trackAt } from './playback.js';

/** How often a `timeupdate` may write into the store — one write a second is plenty for a label. */
const TIME_SYNC_INTERVAL_MS = 1000;

/**
 * `HTMLMediaElement.preservesPitch` (and its older WebKit name) isn't in every
 * lib.dom typing revision, so this narrows via a structural type instead of
 * `any` — the two extra fields are optional, matching how inconsistently
 * browsers actually implement them.
 */
type PitchPreservingAudio = HTMLAudioElement & {
  preservesPitch?: boolean;
  webkitPreservesPitch?: boolean;
};

/**
 * Sets pitch correction explicitly rather than trusting the default. Today's
 * browsers default this to `true`, but it is not spec-guaranteed across engines
 * or versions, and the failure if it's ever `false` is total, not cosmetic — a
 * book read at 1.5x without pitch correction is unlistenable chipmunk audio, not
 * a minor quality regression. Both the standard and legacy WebKit-prefixed
 * properties are feature-detected (assigning to a property that doesn't exist is
 * harmless; branching on reading one that doesn't exist is not) and set
 * unconditionally so a listener never silently gets the wrong one.
 */
function applyPreservesPitch(audio: PitchPreservingAudio): void {
  if ('preservesPitch' in audio) audio.preservesPitch = true;
  if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = true;
}

export function useAudioElement(): void {
  const api = useApi();
  const audioRef = useRef<PitchPreservingAudio | null>(null);
  const loadedFileIdRef = useRef<string | null>(null);
  const lastPushedTimeRef = useRef<number>(0);

  const currentItem = usePlayerStore((s) => s.currentItem);
  const tracks = usePlayerStore((s) => s.tracks);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const playbackRate = usePlayerStore((s) => s.playbackRate);

  if (audioRef.current === null && typeof Audio !== 'undefined') {
    audioRef.current = new Audio();
  }

  // Keeps the store's `currentTime` honest while genuine playback is happening,
  // without ever letting a decode failure (see file header) surface as a thrown
  // error — a `<audio>` that can't play the fixture bytes should leave the store
  // exactly where the last explicit seek left it, not crash the player.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    let lastWriteAt = 0;
    const handleTimeUpdate = () => {
      const now = Date.now();
      if (now - lastWriteAt < TIME_SYNC_INTERVAL_MS) return;
      lastWriteAt = now;
      const match = trackAt(tracks, usePlayerStore.getState().currentTime);
      const trackStart = match?.track.startOffset ?? 0;
      const absolute = trackStart + audio.currentTime;
      lastPushedTimeRef.current = absolute;
      usePlayerStore.getState().seek(absolute);
    };
    const handleError = () => {
      // Degrade, don't throw — see file header. Pausing keeps `isPlaying` from
      // lying about an element that will never actually produce sound.
      usePlayerStore.getState().pause();
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('error', handleError);
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('error', handleError);
    };
  }, [tracks]);

  // Loads whichever track the current absolute time falls in, only when that
  // track actually changes (or the book itself changes) — re-assigning `src` on
  // every seek-within-a-track would restart the element's own buffering.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentItem) return;
    const match = trackAt(tracks, currentTime);
    if (!match) return;
    const fileId = fileIdFromContentUrl(match.track.contentUrl);
    if (!fileId) return;

    if (loadedFileIdRef.current !== fileId) {
      loadedFileIdRef.current = fileId;
      audio.src = api.audioTrackUrl(currentItem.id, fileId);
    }

    // Only correct drift bigger than the timeupdate's own margin of error —
    // otherwise this effect and `handleTimeUpdate` above would fight each other
    // every second, each nudging the other's small rounding difference.
    const withinTrack = currentTime - match.track.startOffset;
    if (Math.abs(audio.currentTime - withinTrack) > 1.5) {
      audio.currentTime = withinTrack;
    }
  }, [api, currentItem, tracks, currentTime]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
    applyPreservesPitch(audio);
  }, [playbackRate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      // The fixture audio's `play()` rejects (see file header) — that rejection
      // must never become an unhandled promise rejection or bubble as a thrown
      // error out of an effect.
      audio.play().catch(() => {
        usePlayerStore.getState().pause();
      });
    } else {
      audio.pause();
    }
  }, [isPlaying]);
}
