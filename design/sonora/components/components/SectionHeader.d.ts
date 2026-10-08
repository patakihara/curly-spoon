import { ReactNode } from 'react';

/**
 * Heading row above a carousel, grid or list, with an optional trailing icon action.
 */
export interface SectionHeaderProps {
  title: string;
  /** Material Symbols Rounded glyph name for the trailing action, e.g. "arrow_forward". Omit for no action. */
  action?: string;
  actionLabel?: string;
  /** Without it the action is drawn disabled. */
  onAction?: () => void;
  /** mobile = body font at text-xl; desktop = display font at h3, 900 weight. */
  platform?: 'mobile' | 'desktop';
  /** Relationship line above the title — "More like", "Popular with listeners of" — that explains why this shelf exists. */
  eyebrow?: string;
  /** Subject artwork, leading the header. Falls back to the sibling CoverArt's own placeholder. */
  image?: string;
  /** Circular thumbnail for an artist or a person; square (the default) for a show or a genre. */
  round?: boolean;
  /** Makes the eyebrow+title block a link to the subject the shelf is about, handed the click or key event. Without it the subject is the heading, not a link. */
  onSubject?: (e?: any) => void;
  /** A text action ("Show all") in place of the glyph `action`. Mutually exclusive with `action` — wins if both are set. */
  actionText?: string;
  /**
   * A control of the section's own at the trailing edge, such as the `ViewToggle` over the
   * collection the section holds. Wins over `actionText` and `action` if more than one is set.
   */
  trailing?: ReactNode;
}
export declare function SectionHeader(props: SectionHeaderProps): JSX.Element;
