import { ReactNode } from 'react';

/** A tag/genre pill for filter tags: outlined at rest, filled with the accent when selected, with an optional song count. */
export interface ChipProps {
  children: ReactNode;
  count?: number;
  selected?: boolean;
  platform?: 'desktop' | 'mobile';
  onClick?: () => void;
}
