import { ReactNode } from 'react';

/** A round, transparent glyph button: surface ink, muted ink, or the active colour. */
export interface IconButtonProps {
  /** A glyph span, or any content. Ignored when `icon` is given. */
  children?: ReactNode;
  /** A Material Symbols Rounded glyph name, drawn at `--icon-sm` in place of `children`. */
  icon?: string;
  size?: number;
  active?: boolean;
  /** The colour `active` takes: `accent` (default), or `play` for the transport's play/pause. */
  tone?: 'accent' | 'play';
  muted?: boolean;
  label: string;
  onClick?: () => void;
}
