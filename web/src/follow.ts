import { createContext, useContext } from 'react';

/**
 * Following a show. A generated page's `<Follow ref>` binds a subscribe control's change to
 * `follow(ref)`, the handler that follows the show `ref` names, or unfollows it, by the state the
 * control hands it, as its `<Request>` binds `useRequest()` (`./request`). The page drawing the
 * generated page hands it down (`FollowContext`); with none, as on the canvas, the control has no
 * handler and draws disabled rather than seeming to work.
 */
export type Follow = (ref: string) => ((following: boolean) => void) | undefined;

/** The follows a page hands the generated page it draws. */
export const FollowContext = createContext<Follow | null>(null);

const none: Follow = () => undefined;

/** The follows the page drawing this one handed down, or none. */
export function useFollow(): Follow {
  return useContext(FollowContext) ?? none;
}
