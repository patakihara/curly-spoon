import { createContext, useContext } from 'react';
import { RequestRef } from '@auralis/schema';

/**
 * Asking for what the library lacks. A generated page's `<Request ref>` binds a control to
 * `askFor(ref)`, as its `<Act>` binds `useAct()` (`./act`). The canvas's refs are strings, so each
 * carries its `RequestRef` written out (`requestKey`), and a ref that holds none, like the `MediaRef`
 * key of an item you have, can ask for nothing. With no handler, as on the canvas, the control draws
 * disabled rather than seeming to work.
 */
export type Request = (ref: string) => (() => void) | undefined;

/** The requests a page hands the generated page it draws. */
export const RequestContext = createContext<Request | null>(null);

const none: Request = () => undefined;

/** The requests the page drawing this one handed down, or none. */
export function useRequest(): Request {
  return useContext(RequestContext) ?? none;
}

/** A request as the string ref a page's data carries. */
export const requestKey = (ref: RequestRef): string => JSON.stringify(ref);

/** The request a page's string ref stands for, or null when it stands for none. */
export function requestOf(key: string): RequestRef | null {
  try {
    const parsed = RequestRef.safeParse(JSON.parse(key));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
