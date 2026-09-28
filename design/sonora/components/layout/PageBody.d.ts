import { ReactNode } from 'react';

/**
 * The body of a page inside the shell: the page margin on both sides (`--grid-margin`, or
 * `--grid-margin-mobile`), the feed's top gap and an optional reading width. Wrap every page's
 * content in it rather than padding a page by hand; Shelf bleeds back out through this margin.
 */
export interface PageBodyProps {
  children?: ReactNode;
  platform?: 'desktop' | 'mobile';
  /** The widest the content runs: a tile grid, a list, a form, or the whole pane (default). */
  width?: 'full' | 'tiles' | 'list' | 'form';
}

export declare function PageBody(props: PageBodyProps): JSX.Element;
