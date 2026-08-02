/**
 * Makes one `ApiClient` instance available to the whole tree via context, built
 * with the real global `fetch` — every other consumer of `ApiClient` (its own
 * unit tests, and anything reused server-side one day) injects its own instead,
 * per the house "clients take an injected fetch" rule.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { ApiClient } from './client.js';

const ApiContext = createContext<ApiClient | null>(null);

export interface ApiProviderProps {
  children: ReactNode;
  /** Override for tests/Playwright fixtures; production always uses the default. */
  client?: ApiClient;
}

export function ApiProvider({ children, client }: ApiProviderProps) {
  const value = useMemo(
    () => client ?? new ApiClient({ fetch: window.fetch.bind(window) }),
    [client],
  );
  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error('useApi must be called within an <ApiProvider>.');
  return ctx;
}
