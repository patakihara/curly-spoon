import { ReactNode } from 'react';

/**
 * The page for one library item — MediaHeader plus its list — opening as a CircleReveal from the
 * point that was tapped. Pass the list rows (ResultRows) as children.
 */
export interface DetailPageProps {
  platform?: 'desktop' | 'mobile';
  /** Pointer coordinates of the click that opened it, for the reveal. */
  origin?: { x: number; y: number } | null;
  /** Floats the page over the view beneath it instead of sitting in the page flow. */
  overlay?: boolean;
  zIndex?: number;
  /** MediaHeader content. */
  kindLabel?: string;
  title?: string;
  subtitle?: string;
  meta?: string;
  image?: string;
  /** Circular art, for a person page. */
  round?: boolean;
  onSubtitle?: () => void;
  onPlay?: () => void;
  onPlayNext?: () => void;
  onPlayLast?: () => void;
  playLabel?: string;
  nextLabel?: string;
  lastLabel?: string;
  /** Measure cap on the list. Defaults to `--grid-max-width-list` on desktop, full width on mobile. */
  listMaxWidth?: string;
  children?: ReactNode;
}
export declare function DetailPage(props: DetailPageProps): JSX.Element;
