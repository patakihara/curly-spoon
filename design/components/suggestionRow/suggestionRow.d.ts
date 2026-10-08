// Generated from suggestionRow.json by design/build.js — edit the .json, not this file.
import type { ListItemProps } from '../listItem/listItem';

/** One suggestion in a panel (search predictions, popular searches): a search icon and the text; activating it runs its action (usually setParams on the query).
 *  Variant of listItem: drawn by its implementation. */
export interface SuggestionRowProps extends ListItemProps {
  text: string;
}
export type SuggestionRowState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';
