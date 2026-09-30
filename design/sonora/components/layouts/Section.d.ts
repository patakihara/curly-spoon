/**
 * One block of a feed — a SectionHeader plus its content — carrying the standard spacing to the
 * next block. Prefer this over placing SectionHeader and a Shelf/LayoutGrid loose in a page.
 */
export interface SectionProps {
  /** Heading text. Omit for an untitled block that still takes part in the rhythm. */
  title?: string;
  /** Material Symbols glyph for the header's trailing action, e.g. 'arrow_forward'. */
  action?: string;
  actionLabel?: string;
  /** Without it the action is drawn disabled. */
  onAction?: () => void;
  platform?: 'desktop' | 'mobile';
  /** Drops the trailing margin — set on the final section of a scroll view. */
  last?: boolean;
  children?: React.ReactNode;
  /** Forwarded to SectionHeader — relationship line above the title, e.g. "More like". */
  eyebrow?: string;
  /** Forwarded to SectionHeader — subject artwork, leading the header. */
  image?: string;
  /** Forwarded to SectionHeader — circular thumbnail for an artist or a person; square for a show or a genre. */
  round?: boolean;
  /** Forwarded to SectionHeader — makes the eyebrow+title block a link to the subject. */
  onSubject?: () => void;
  /** Forwarded to SectionHeader — a text action ("Show all") in place of the glyph `action`. */
  actionText?: string;
  /** Forwarded to SectionHeader — a control of the section's own at the header's trailing edge, such as a `ViewToggle`. */
  trailing?: React.ReactNode;
}
export declare function Section(props: SectionProps): JSX.Element;
