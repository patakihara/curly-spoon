export interface SliderProps {
  /** 0–1 */
  value?: number;
  onChange?: (next: number) => void;
  /** Desktop: thin track + round handle (Feishin). Mobile: thick pill split by a divider notch (Booming Music). */
  platform?: 'desktop' | 'mobile';
  /** The fill: `accent` (default), or `play` for playback position (SeekBar passes it). */
  tone?: 'accent' | 'play';
}
