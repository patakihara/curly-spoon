/** Label + value on a filled card (Speed · 1.0x, Sleep timer · Off). Read-only unless you pass onClick. */
export interface ValueRowProps {
  label: string;
  value: string;
  platform?: 'desktop' | 'mobile';
  onClick?: () => void;
}
export declare function ValueRow(props: ValueRowProps): JSX.Element;
