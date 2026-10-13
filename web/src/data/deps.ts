import { createContext, useContext } from 'react';
import { type ApiClient, createApiClient } from '../api/client';
import { type AccessStore, createAccess } from './access';
import { createPageStore, type PageStore } from './store';

/** What the pages' data is read through: the API, who the app is drawn for, the kept data. */
export interface PageDeps {
  api: ApiClient;
  access: AccessStore;
  pages: PageStore;
}

let shared: PageDeps | null = null;

/** The app's own, same origin, made when first read; a refused request asks who is signed in. */
const appDeps = (): PageDeps => {
  if (shared === null) {
    const api = createApiClient();
    const access = createAccess({ api });
    shared = { api, access, pages: createPageStore({ onSignedOut: () => access.refused() }) };
  }
  return shared;
};

/** Hands the screens and the player their dependencies: the app's own unless a test gives others. */
export const PageDepsContext = createContext<PageDeps | null>(null);

export const useDeps = (): PageDeps => useContext(PageDepsContext) ?? appDeps();
