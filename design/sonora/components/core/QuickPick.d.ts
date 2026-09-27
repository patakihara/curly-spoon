/**
 * Continue-listening / jump-back-in tile: small square art plus title and a meta line.
 * Lay several out in a grid at the top of a home screen.
 */
export interface QuickPickProps {
  title: string;
  /** e.g. "Book · 6 h 12 m left". */
  sub?: string;
  /**
   * Material Symbols Rounded glyph name. Given one, the tile renders the glyph on a flat accent
   * tint instead of the gradient artwork square — the variant for destinations with no cover art
   * of their own (Shuffle all, Downloads, Liked, a genre).
   */
  icon?: string;
  /** Cover art URL. Falls back to the generated gradient when omitted. */
  image?: string;
  platform?: 'desktop' | 'mobile';
  onClick?: () => void;
  /** 0–1 resume position; draws a thin rule across the base of the artwork square. Ignored on the `icon` variant. */
  progress?: number | null;
  /** Marks unlistened/new content with a small accent dot on the artwork's top-right. Ignored on the `icon` variant. */
  unplayed?: boolean;
}
export declare function QuickPick(props: QuickPickProps): JSX.Element;
