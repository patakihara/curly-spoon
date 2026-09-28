import { ReactNode } from 'react';

/**
 * What a page shows when it has nothing to show: a link that leads nowhere, a library with no
 * books yet, a search that matched nothing. A glyph, the fact as a heading and one plain line,
 * then the one way on, centred in the content column at the form width. States facts, never
 * reassurance.
 */
export interface EmptyStateProps {
  /** Material Symbols Rounded glyph naming what is missing, drawn muted in a card-tone circle. */
  icon?: string;
  /** The fact, e.g. "This page doesn't exist". */
  title: string;
  /** One line more, e.g. where the thing is found instead. */
  body?: string;
  /** The one way on: a `Button`, secondary unless it plays. */
  action?: ReactNode;
  platform?: 'desktop' | 'mobile';
}
export declare function EmptyState(props: EmptyStateProps): JSX.Element;
