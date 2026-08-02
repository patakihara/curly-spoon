import type { Ref, RefCallback } from 'react';

/**
 * Combines multiple refs (a forwarded ref plus a local one) into a single callback ref.
 * Every M3 component forwards its ref *and* frequently needs a local one (for measuring,
 * focus management, etc.) — this is the one place that plumbing lives.
 */
export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): RefCallback<T> {
  return (value: T | null) => {
    for (const ref of refs) {
      if (typeof ref === 'function') {
        ref(value);
      } else if (ref && typeof ref === 'object') {
        (ref as { current: T | null }).current = value;
      }
    }
  };
}
