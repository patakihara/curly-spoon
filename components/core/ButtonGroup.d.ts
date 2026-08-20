/**
 * M3 connected button group — a row of segments that read as one control:
 * outer ends fully rounded, 8px inner corners, and the selected segment morphs
 * to fully rounded on both sides. Use for library filters and mode switches,
 * not for navigation.
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
}
export declare function ButtonGroup(props: ButtonGroupProps): JSX.Element;
