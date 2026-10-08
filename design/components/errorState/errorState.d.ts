// Generated from errorState.json by design/build.js — edit the .json, not this file.
import type { EmptyStateProps } from '../emptyState/emptyState';

/** A failed load: a short message, plus retry when the error is retryable.
 *  Variant of emptyState: drawn by its implementation. */
export interface ErrorStateProps extends EmptyStateProps {
  text: string;
  retry: string;
}
