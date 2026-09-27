/**
 * The lyric sheet's sync control — a TonalIconButton (same shape as the list/grid toggle) cycling
 * `sync` → `dot` → `off`: synced (current line in accent ink), current line marked by an accent dot
 * only, then no sync and no indication. The glyph turns over as the mode changes.
 */
export interface LyricsSyncButtonProps {
  mode?: 'sync' | 'dot' | 'off';
  /** Receives the next mode in the cycle. */
  onChange?: (mode: 'sync' | 'dot' | 'off') => void;
}
export declare function LyricsSyncButton(props: LyricsSyncButtonProps): JSX.Element;
