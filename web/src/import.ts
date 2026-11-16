import { createContext, useContext } from 'react';

/**
 * Importing an outside playlist as one of your lists. A generated page's `<Import from>` binds a
 * control to `importFrom(from)`, the handler that imports the playlist the link `from` names and
 * opens the list it makes, as its `<Request>` binds `useRequest()` (`./request`). The page drawing
 * the generated page hands it down (`ImportContext`); with none, as on the canvas, the control has
 * no handler and draws disabled rather than seeming to work.
 */
export type Import = (from: string) => (() => void) | undefined;

/** The imports a page hands the generated page it draws. */
export const ImportContext = createContext<Import | null>(null);

const none: Import = () => undefined;

/** The imports the page drawing this one handed down, or none. */
export function useImport(): Import {
  return useContext(ImportContext) ?? none;
}
