/**
 * Wires the player into the OS-level "now playing" surface (lock screen media
 * controls, hardware media keys, car head units) via the Media Session API.
 * Entirely optional decoration: `navigator.mediaSession` is absent in some
 * browsers, and even where present, individual actions
 * (`setActionHandler`) can throw `NotSupportedError` for actions that specific
 * browser/OS pairing doesn't support — each handler is registered in its own
 * try/catch so one unsupported action can't stop the rest from being wired up.
 */
import { useEffect } from 'react';
import { useApi } from '../../api/ApiContext.js';
import { usePlayerStore } from '../../state/playerStore.js';
import { useSettingsStore } from '../../state/settingsStore.js';

function setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler): void {
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // This browser/OS doesn't support this particular action — leave it unset.
  }
}

export function useMediaSession(): void {
  const api = useApi();
  const currentItem = usePlayerStore((s) => s.currentItem);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    if (!currentItem) {
      navigator.mediaSession.metadata = null;
      return;
    }

    const authors =
      currentItem.media.authors?.map((a) => a.name).join(', ') ?? currentItem.media.author ?? '';
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentItem.media.title,
      artist: authors,
      artwork: [{ src: api.coverUrl(currentItem.id, { width: 512 }) }],
    });
  }, [api, currentItem]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return undefined;

    setActionHandler('play', () => usePlayerStore.getState().play());
    setActionHandler('pause', () => usePlayerStore.getState().pause());
    setActionHandler('seekbackward', () => {
      const { skipBackSeconds } = useSettingsStore.getState();
      usePlayerStore.getState().skip(-skipBackSeconds);
    });
    setActionHandler('seekforward', () => {
      const { skipForwardSeconds } = useSettingsStore.getState();
      usePlayerStore.getState().skip(skipForwardSeconds);
    });
    setActionHandler('previoustrack', () => {
      const state = usePlayerStore.getState();
      const current = state.chapters.find(
        (c) => c.start <= state.currentTime && c.end >= state.currentTime,
      );
      if (current) state.seek(current.start);
    });
    setActionHandler('nexttrack', () => {
      const state = usePlayerStore.getState();
      const next = state.chapters.find((c) => c.start > state.currentTime);
      if (next) state.seek(next.start);
    });

    return () => {
      for (const action of [
        'play',
        'pause',
        'seekbackward',
        'seekforward',
        'previoustrack',
        'nexttrack',
      ] as MediaSessionAction[]) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // Nothing to clean up if the browser never accepted the handler.
        }
      }
    };
  }, []);
}
