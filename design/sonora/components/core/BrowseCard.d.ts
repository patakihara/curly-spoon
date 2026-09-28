/**
 * Navigates into a category whose content you can't name yet — distinct from Chip, which filters
 * an existing result set. Filled with a shade of the accent, with its artwork tilted out of the bottom-right corner so
 * the card reads as a stack of content rather than a label.
 */
export interface BrowseCardProps {
  title: string;
  /** Tilted thumbnail anchored to the bottom-right corner. */
  image?: string;
  onClick?: () => void;
  platform?: 'desktop' | 'mobile';
}
export declare function BrowseCard(props: BrowseCardProps): JSX.Element;
