/**
 * Auditions a sample without committing it — plays without adding the item to the library or
 * displacing whatever is currently playing. The disabled state covers a sample that hasn't
 * loaded yet, a real fourth state alongside idle/sounding/muted.
 */
export interface PreviewButtonProps {
  /** Selects the generated label ("Preview episode") when `label` is not supplied. */
  kind?: 'episode' | 'playlist' | 'audiobook' | 'track';
  /** Overrides the generated label entirely. */
  label?: string;
  /** Sample is playing; the glyph flips to the sounding speaker. */
  playing?: boolean;
  /** Playing with sound off — the resting state a preview starts in. */
  muted?: boolean;
  /** No sample available: dims the control, not-allowed cursor, aria-disabled. */
  disabled?: boolean;
  onClick?: () => void;
  platform?: 'desktop' | 'mobile';
}
export declare function PreviewButton(props: PreviewButtonProps): JSX.Element;
