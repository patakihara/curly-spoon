import { createContext, useContext } from 'react';

/** The settings a switch can set, as the canvas's `<Toggle setting>` names them. */
export type ToggleSetting = 'showEveryonesLibrary';

/**
 * A page's switches. A generated page's `<Toggle setting>` binds a switch to `toggle(setting)`, the
 * handler that sets the setting to what the switch says, as its `<Act>` binds `useAct()` (`./act`).
 * The page drawing the generated page hands its own toggles down (`ToggleContext`); with none, as
 * on the canvas, `toggle` gives no handler and the switch draws disabled rather than seeming to work.
 */
export type Toggle = (setting: ToggleSetting) => ((next: boolean) => void) | undefined;

/** The toggles a page hands the generated page it draws. */
export const ToggleContext = createContext<Toggle | null>(null);

const none: Toggle = () => undefined;

/** The toggles the page drawing this one handed down, or none. */
export function useToggle(): Toggle {
  return useContext(ToggleContext) ?? none;
}
