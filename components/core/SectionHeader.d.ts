/**
 * Heading row above a carousel, grid or list, with an optional trailing icon action.
 */
export interface SectionHeaderProps {
  title: string;
  /** Material Symbols Rounded glyph name for the trailing action, e.g. "arrow_forward". Omit for no action. */
  action?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** mobile = body font at text-xl; desktop = display font at h3, 900 weight. */
  platform?: 'mobile' | 'desktop';
}
export declare function SectionHeader(props: SectionHeaderProps): JSX.Element;
