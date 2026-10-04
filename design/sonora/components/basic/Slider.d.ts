export interface SliderProps {
  /** 0–1 */
  value?: number;
  /**
   * Receives the new value: on a press on the track, on every move while the pointer is held, on
   * its release where it lets go elsewhere, and on the arrow keys; a click is one change. Without
   * it the slider is drawn disabled.
   */
  onChange?: (next: number) => void;
  /** Desktop: thin track + round handle (Feishin). Mobile: thick pill split by a divider notch (Booming Music). */
  platform?: 'desktop' | 'mobile';
  /** The fill: `accent` (default), or `play` for playback position (SeekBar passes it). */
  tone?: 'accent' | 'play';
  /** Its accessible name, such as "Seek" or "Volume". */
  label?: string;
}
