import { ReactNode } from 'react';

/**
 * Learn about what you're listening to without leaving the player — about the episode, the show,
 * the person, stacked beneath the transport as a filled card. Composes ExpandableText for `body`
 * and CoverArt for `image`.
 */
export interface AboutCardProps {
  /** The card's own heading — "About the episode". */
  title: string;
  /** The subject's name inside the card. */
  heading?: string;
  /** "8 Aug 2024". */
  meta?: string;
  image?: string;
  /** Circular art, for a person. */
  round?: boolean;
  /** Prose, rendered through ExpandableText. */
  body?: string;
  /** Lines shown before "see more". Default 3. */
  lines?: number;
  /** A FollowButton, typically. */
  action?: ReactNode;
  /** A Badge — the played check. */
  badge?: ReactNode;
  platform?: 'desktop' | 'mobile';
}
export declare function AboutCard(props: AboutCardProps): JSX.Element;
