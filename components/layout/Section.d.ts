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
  onAction?: () => void;
  platform?: 'desktop' | 'mobile';
  /** Drops the trailing margin — set on the final section of a scroll view. */
  last?: boolean;
  children?: React.ReactNode;
}
export declare function Section(props: SectionProps): JSX.Element;
