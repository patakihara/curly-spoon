/**
 * Wires the pure `matchShortcut`/`isTypingTarget` rules (shortcuts.ts) to a real
 * `keydown` listener: owns the chord timeout and the actual navigation/store
 * side effects. Mounted once, at the shell root (docs/DESIGN.md § Accessibility).
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { isTypingTarget, matchShortcut } from './shortcuts.js';
import { useUiStore } from '../state/uiStore.js';
import { queryKeys } from '../api/queries.js';
import type { Library } from '../api/types.js';

/** How long a lone "g" stays armed, waiting for its second key. */
const CHORD_TIMEOUT_MS = 900;

export function useKeyboardShortcuts(): void {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const openShortcutSheet = useUiStore((s) => s.openShortcutSheet);
  const requestSearchFocus = useUiStore((s) => s.requestSearchFocus);

  // Chord state lives in refs, not React state: it must be readable synchronously
  // inside the next keydown, and changing it should never itself trigger a render.
  const chordPendingRef = useRef(false);
  const chordTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const clearChord = () => {
      chordPendingRef.current = false;
      clearTimeout(chordTimeoutRef.current);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      const { action, chordPending } = matchShortcut(event.key, chordPendingRef.current);
      chordPendingRef.current = chordPending;
      clearTimeout(chordTimeoutRef.current);
      if (chordPending) chordTimeoutRef.current = setTimeout(clearChord, CHORD_TIMEOUT_MS);

      switch (action) {
        case 'focus-search':
          event.preventDefault();
          void navigate({ to: '/search' });
          requestSearchFocus();
          break;
        case 'open-shortcut-sheet':
          event.preventDefault();
          openShortcutSheet();
          break;
        case 'go-home':
          void navigate({ to: '/' });
          break;
        case 'go-library': {
          const cached = queryClient.getQueryData<{ libraries: Library[] }>(queryKeys.libraries);
          const first = cached?.libraries[0];
          if (first) void navigate({ to: '/library/$libraryId', params: { libraryId: first.id } });
          break;
        }
        case null:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearChord();
    };
  }, [navigate, queryClient, openShortcutSheet, requestSearchFocus]);
}
