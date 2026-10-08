/**
 * The persistent now-playing surface, in both platform variants: the tinted pill
 * docked above the mobile bottom nav, or the desktop three-column transport bar, the one
 * place desktop draws the transport.
 */
export interface MiniPlayerProps {
  title: string;
  artist: string;
  image?: string;
  playing?: boolean;
  /** Every control with no handler is drawn disabled, the bar itself with no onOpen. Each control's handler is handed the click or key event. */
  onTogglePlay?: (e?: any) => void;
  /** Tapping the card body (mobile) or the track block (desktop) expands the full player. Handed the click or key event. */
  onOpen?: (e?: any) => void;
  /** mobile = docked tinted pill; desktop = full-width transport bar with seek and queue controls. */
  platform?: 'mobile' | 'desktop';
  /** 0–1. Desktop only — drives the seek bar and the mm:ss elapsed readout. */
  progress?: number;
  onSeek?: (value: number) => void;
  /** Track length in seconds, for the mm:ss readouts. Desktop only. */
  duration?: number;
  onPrev?: (e?: any) => void;
  onNext?: (e?: any) => void;
  /** Desktop music bar only. */
  onShuffle?: (e?: any) => void;
  /** Desktop music bar only. */
  onRepeat?: (e?: any) => void;
  /** Desktop only. */
  onVolume?: (e?: any) => void;
  /** Desktop only — tints the queue button accent while the queue panel is open. */
  queueOpen?: boolean;
  onToggleQueue?: (e?: any) => void;
  /** Desktop only — same for the lyrics button, which opens the player panel's Lyrics tab. */
  lyricsOpen?: boolean;
  onToggleLyrics?: (e?: any) => void;
  /** Desktop only: `spoken` swaps shuffle, previous, next and repeat for speed, skip back and forward and the sleep timer, and drops the lyrics button. */
  variant?: 'music' | 'spoken';
  /** `spoken` only. */
  onSkipBack?: (e?: any) => void;
  /** `spoken` only. */
  onSkipForward?: (e?: any) => void;
  /** `spoken` only: the interval skipped, in seconds. Default 15. */
  skipSeconds?: number;
  /** `spoken` only: the playback rate, 1, 1.25, 1.5 … */
  speed?: number;
  onSpeed?: (e?: any) => void;
  /** `spoken` only: the sleep timer's state, "Off", "23 min". */
  sleep?: string;
  onSleep?: (e?: any) => void;
}
export declare function MiniPlayer(props: MiniPlayerProps): JSX.Element;
