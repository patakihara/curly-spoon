import { createContext, useContext } from 'react';

/**
 * Asking again for what a page failed to load. A generated page's `<Retry />` binds a control to
 * `useRetry()`, as its `<Act>` binds `useAct()` (`./act`). The page drawing the generated page hands
 * it down (`RetryContext`) while its load has failed; with none, as on the canvas, the control has
 * no handler and draws disabled rather than seeming to work.
 */
export const RetryContext = createContext<(() => void) | undefined>(undefined);

/** What asks again for the page's data, or nothing while there is nothing to ask again for. */
export const useRetry = (): (() => void) | undefined => useContext(RetryContext);
