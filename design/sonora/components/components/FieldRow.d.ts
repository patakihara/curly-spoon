/**
 * Labelled form field wrapping the system Input. On mobile it supplies the filled
 * pill container the chromeless mobile Input expects to sit on.
 */
export interface FieldRowProps {
  label: string;
  placeholder?: string;
  value?: string;
  platform?: 'desktop' | 'mobile';
  onChange?: (next: string) => void;
}
export declare function FieldRow(props: FieldRowProps): JSX.Element;
