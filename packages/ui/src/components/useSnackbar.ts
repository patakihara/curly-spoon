/**
 * A snackbar *queue* — only one snackbar is ever on screen, later ones wait their turn
 * rather than stacking or interrupting, matching the M3 snackbar spec.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export interface SnackbarMessage {
  id: string;
  message: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  /** Auto-dismiss delay in ms. Defaults to 4000. */
  durationMs?: number;
}

export interface UseSnackbarResult {
  /** The message currently shown, or `null` when the queue is empty. */
  current: SnackbarMessage | null;
  enqueue: (message: Omit<SnackbarMessage, 'id'>) => void;
  /** Dismisses the current message and advances to the next queued one, if any. */
  dismiss: () => void;
}

export function useSnackbar(): UseSnackbarResult {
  const [queue, setQueue] = useState<SnackbarMessage[]>([]);
  const nextId = useRef(0);

  const enqueue = useCallback((message: Omit<SnackbarMessage, 'id'>) => {
    nextId.current += 1;
    const id = `snackbar-${nextId.current}`;
    setQueue((current) => [...current, { ...message, id }]);
  }, []);

  const dismiss = useCallback(() => {
    setQueue((current) => current.slice(1));
  }, []);

  const current = queue[0] ?? null;

  useEffect(() => {
    if (!current) return undefined;
    const timer = window.setTimeout(dismiss, current.durationMs ?? 4000);
    return () => window.clearTimeout(timer);
  }, [current, dismiss]);

  return { current, enqueue, dismiss };
}
