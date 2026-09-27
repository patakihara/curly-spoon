/** A single accent-colour choice from the accent preset palette; lay several out in a row for the picker. */
export interface AccentSwatchProps {
  /** Any CSS colour — pass an --accent-* token value. */
  color: string;
  /** Accessible name / tooltip, e.g. "Lilac". */
  name?: string;
  selected?: boolean;
  /** lg is the settings picker, sm the inline row. */
  size?: 'sm' | 'lg';
  onClick?: () => void;
}
export declare function AccentSwatch(props: AccentSwatchProps): JSX.Element;
