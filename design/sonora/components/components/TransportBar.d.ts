import { ReactNode } from 'react';

/**
 * Now Playing control cluster: shuffle, previous, play/pause (the large accent control), next,
 * repeat. `variant="spoken"` swaps previous/next for skip-back/skip-forward-by-interval and
 * replaces the shuffle/repeat ends with `leading`/`trailing` — different verbs for spoken-word
 * content, where "previous track" across a two-hour episode is close to useless.
 */
export interface TransportBarProps {
  playing?: boolean;
  platform?: 'desktop' | 'mobile';
  /** Every control with no handler is drawn disabled. */
  onTogglePlay?: () => void;
  /** Ignored in `spoken`. */
  onPrev?: () => void;
  /** Ignored in `spoken`. */
  onNext?: () => void;
  /** Ignored in `spoken`. */
  onShuffle?: () => void;
  /** Ignored in `spoken`. */
  onRepeat?: () => void;
  /** 'music' (default) is today's shuffle/prev/play/next/repeat row, unchanged. */
  variant?: 'music' | 'spoken';
  /** `spoken` only: replaces "Previous". */
  onSkipBack?: () => void;
  /** `spoken` only: replaces "Next". */
  onSkipForward?: () => void;
  /** Interval skipped, drawn into the skip glyph's overlaid number and its label. Default 15. */
  skipSeconds?: number;
  /** `spoken` only: replaces the shuffle end — a SpeedControl, typically. Nothing when omitted. */
  leading?: ReactNode;
  /** `spoken` only: replaces the repeat end — a sleep-timer control. Nothing when omitted. */
  trailing?: ReactNode;
}
export declare function TransportBar(props: TransportBarProps): JSX.Element;
