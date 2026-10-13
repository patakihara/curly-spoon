import { useSyncExternalStore } from 'react';
import { type ApiClient, createApiClient, fetchHealth } from '../api/client';

/**
 * Who the app is drawn for, which decides what its pages show. The app asks the server once, as it
 * starts, whether it has a household sign-on (`GET /api/health`). With one, the server sent a
 * signed-out visitor to sign in before the app was ever served, so the app is drawn for a member,
 * who sees their own library; a request refused later for want of a sign-in (401) sends them to
 * sign in, back to where they were (`return_to`), as the server would. A server with none, which
 * nobody can sign in to, serves every page as it is, and so the app keeps drawing the canvas's
 * placeholders, its pages and its player alike. Asking the server costs no refused request, so a
 * page on the canvas logs no error.
 */

/** Not asked yet; a member; signed out, on a server that sends them to sign in; or the canvas. */
export type Access = 'unknown' | 'member' | 'signedOut' | 'canvas';

export interface AccessOptions {
  /** The API; same origin by default. */
  api?: ApiClient;
  /** Opens the sign-in page, coming back to `returnTo`. */
  signIn?: (returnTo: string) => void;
  /** Where the visitor is: path and query. */
  here?: () => string;
}

export interface AccessStore {
  subscribe(listener: () => void): () => void;
  getState(): Access;
  /** A request was refused for want of a sign-in. */
  refused(): void;
  /** Sends a signed-out visitor to sign in, once, back to where they are. */
  signIn(): void;
}

export function createAccess(options: AccessOptions = {}): AccessStore {
  const api = options.api ?? createApiClient();
  const openSignIn =
    options.signIn ??
    ((returnTo: string) =>
      window.location.assign(`/sign-in?${new URLSearchParams({ return_to: returnTo })}`));
  const here = options.here ?? (() => window.location.pathname + window.location.search);

  let state: Access = 'unknown';
  let sent = false;
  /** Whether the server has a sign-on; until it has said, it is taken to have one. */
  let signOn = true;
  const listeners = new Set<() => void>();
  const set = (to: Access) => {
    if (to === state) return;
    state = to;
    listeners.forEach((listener) => listener());
  };

  const asked = fetchHealth(api).then(
    (health) => {
      signOn = health.signOn;
      if (state === 'unknown') set(signOn ? 'member' : 'canvas');
    },
    // Unreachable, the server is asked again by each page's own request.
    () => {
      if (state === 'unknown') set('member');
    },
  );

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => state,
    refused: () => void asked.then(() => set(signOn ? 'signedOut' : 'canvas')),
    signIn() {
      if (sent || state !== 'signedOut') return;
      sent = true;
      openSignIn(here());
    },
  };
}

/** Who the app is drawn for, as `store` says. */
export function useAccessOf(store: AccessStore): Access {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
