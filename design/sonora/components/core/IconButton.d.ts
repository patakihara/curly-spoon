import { ReactNode } from 'react';

/** A round, transparent glyph button: surface ink, muted ink, or the active colour. */
export interface IconButtonProps {
  children: ReactNode;
  size?: number;
  active?: boolean;
  /** The colour `active` takes: `accent` (default), or `play` for the transport's play/pause. */
  tone?: 'accent' | 'play';
  muted?: boolean;
  label: string;
  onClick?: () => void;
}
