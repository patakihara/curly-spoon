/**
 * Debounces a value by `delayMs`, settling only once it has stopped changing for that
 * long. Used to gate the two request-search fan-outs (`GET /requests/search`,
 * `GET /music-requests/search`) that `SearchPage.tsx` now fires from the same field the
 * library search uses.
 *
 * The library search itself (`useLibrarySearchQuery`) is deliberately left undebounced —
 * it always was, and it hits Auralis's own BFF filtering an in-memory-ish Audiobookshelf
 * index. Request search is different in kind: it fans out to a real indexer or a real
 * Soulseek network search (`AskForBookPanel.tsx`'s and `MusicRequestSearchPanel.tsx`'s own
 * header comments both call this out as "slow and rude to hammer on every keystroke" —
 * which is exactly why those two panels only ever searched on an explicit submit). The
 * unified Search view has no submit button by design, so a debounce is what stands in for
 * that explicit-submit gate here.
 *
 * No test file of its own: it is a thin `setTimeout` wrapper around React state, and the
 * behaviour worth pinning — that a debounced term only feeds the requestable sections, and
 * settles before firing a request search — is exercised in the browser by
 * `e2e/app/search-view.spec.ts` instead, the same way `SearchPage.tsx`'s other timing-
 * dependent behaviour (its `aria-live` status line) is.
 */
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
