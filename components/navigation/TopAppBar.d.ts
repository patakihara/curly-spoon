import { ReactNode } from 'react';

/**
 * Top app bar — a `--surface-bg-alt` strip above the page content. The first row carries the
 * page title (plus optional leading/trailing controls); the page's controls — a filter
 * ButtonGroup, or a centred SearchField — sit on a second row beneath it. The content below
 * should have rounded top corners so the bar reads as the surface behind it.
 */
export interface TopAppBarProps {
  /** Page title, set in the display face at 900. */
  title?: string;
  /** Second-row content: a ButtonGroup, a SearchField, whatever the screen needs. */
  children?: ReactNode;
  /** center caps the second row at 560px and centres it (the library search treatment). */
  align?: 'start' | 'center';
  /** Sits the leading/trailing controls on their own bg-alt layer so scrolling second-row content fades under them. */
  occlude?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  platform?: 'desktop' | 'mobile';
  /** Square the top corners of the controls row — right when a side sheet abuts it. */
  squareLeft?: boolean;
  squareRight?: boolean;
  /** 0–1 scroll progress, as reported by AppShell's `onProgress`. */
  progress?: number;
  /**
   * In-bar search. Passing onSearchToggle adds a search button before `trailing`; when
   * searchOpen the title fades out, a SearchField grows across the title row (autofocused),
   * `trailing` collapses, and the button becomes a close.
   */
  searchOpen?: boolean;
  onSearchToggle?: (next: boolean) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** false hides the search icon while the field is closed — for a bar where scrolling opens search. The close icon still appears while open. */
  searchButton?: boolean;
  /** false opens the field without focusing it — for search that expands on scroll rather than on a tap. */
  searchAutoFocus?: boolean;
  /** Height of the in-bar search field. Defaults to "100%" (fills the bar row). */
  searchHeight?: string;
  /** Bar surface. Defaults to `--surface-bg-alt`; a page that owns the surface can pass `--surface-bg`. */
  background?: string;
}
export declare function TopAppBar(props: TopAppBarProps): JSX.Element;
