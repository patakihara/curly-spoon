// Generated from localSearch.json by design/build.js — edit the .json, not this file.
import type { SearchFieldProps } from '../searchField/searchField';
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)

/** Local search in a header (front layer, app bar): an icon until the content scrolls (or it is tapped), then a thin, squarish search field. Bound to the page's own text param (usually 'find'); the data source filters by it. Drawn by searchField.
 *  Variant of searchField: drawn by its implementation. */
export interface LocalSearchProps extends SearchFieldProps {
  end: Slot;
}
export type LocalSearchState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';
