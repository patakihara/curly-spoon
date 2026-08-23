import { ReactNode } from 'react';

/**
 * M3 connected button group — a row of segments that read as one control:
 * outer ends fully rounded, 8px inner corners, and the selected segment morphs
 * to fully rounded on both sides. Use for library filters and mode switches,
 * not for navigation.
 *
 * Never shows a native scrollbar. When the row overflows, a soft edge fade (a shadow in light
 * theme, a glow in dark) appears only on the side(s) where content is actually clipped right now
 * — gone the instant scrolling reaches that end, absent entirely when nothing overflows.
 */
export interface ButtonGroupProps {
  /**
   * Labels, or `{ key, label?, icon? }` — `icon` is a Material Symbols Rounded glyph name.
   * An item with an icon and no label renders as a square icon-only segment (the label is
   * still used for its accessible name).
   */
  items: (string | { key: string; label?: string; icon?: string })[];
  /** Key of the selected segment. */
  value?: string;
  onChange?: (next: string) => void;
  platform?: 'desktop' | 'mobile';
  /** @deprecated No longer needed — the edge-fade affordance is now automatic whenever the row overflows. Kept as a no-op for existing callers. */
  scroll?: boolean;
  /** A pinned, non-scrolling slot before the first segment — an account avatar, in every Spotify filter row. */
  leading?: ReactNode;
}
export declare function ButtonGroup(props: ButtonGroupProps): JSX.Element;
