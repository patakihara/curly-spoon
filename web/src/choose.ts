import { createContext, useContext } from 'react';

/**
 * A menu's verbs. A generated page's `<Choose ref>` binds a menu's `onSelect` to `choose(ref)`,
 * the handler that does the chosen verb, by its key, to the item `ref` names, as its `<Play>` binds
 * `usePlay()` (`./player`). The page drawing the generated page hands its own verbs down
 * (`ChooseContext`); with none, as on the canvas, `choose` gives no handler and the menu's button
 * draws disabled rather than seeming to work.
 */
export type Choose = (ref: string) => ((key: string) => void) | undefined;

/** The verbs a page hands the generated page it draws. */
export const ChooseContext = createContext<Choose | null>(null);

const none: Choose = () => undefined;

/** The verbs the page drawing this one handed down, or none. */
export function useChoose(): Choose {
  return useContext(ChooseContext) ?? none;
}
