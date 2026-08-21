/**
 * Pill search bar — fully rounded, bordered on desktop and filled on mobile. Use inline
 * (a filter row, a sheet, a settings page). For the centred library search in the top app
 * bar use SearchField, which is filled with soft rectangular corners instead.
 */
export interface SearchBarProps {
  placeholder?: string;
  value?: string;
  onChange?: (next: string) => void;
  onSubmit?: (value: string) => void;
  platform?: 'desktop' | 'mobile';
  width?: string;
}
export declare function SearchBar(props: SearchBarProps): JSX.Element;
