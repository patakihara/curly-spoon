import { createContext, useContext } from 'react';
import { type RequestVerb } from '@auralis/schema';

export type { RequestVerb };

/**
 * A request's verbs. A generated page's `<Act ref verb>` binds a control to `act(ref, verb)`, the
 * handler that does the verb to the request `ref` names, with the release `candidate` for a choice,
 * as its `<Play>` binds `usePlay()` (`./player`). The page drawing the generated page hands its own
 * verbs down (`ActContext`); with none, as on the canvas, `act` gives no handler and the control
 * draws disabled rather than seeming to work.
 */
export type Act = (ref: string, verb: RequestVerb, candidate?: string) => (() => void) | undefined;

/** The verbs a page hands the generated page it draws. */
export const ActContext = createContext<Act | null>(null);

const none: Act = () => undefined;

/** The verbs the page drawing this one handed down, or none. */
export function useAct(): Act {
  return useContext(ActContext) ?? none;
}
