// Generated from contentBlock.json by design/build.js — edit the .json, not this file.
import type { ListItemProps } from '../listItem/listItem';

/** One item in generic content: a large block. Composition hires it for the item contract.
 *  Extends listItem. */
export interface ContentBlockProps extends ListItemProps {
  title: string;
  subtitle: string;
  image: string;
  navigable: boolean;
}
export type ContentBlockState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';
