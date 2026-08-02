/**
 * The app's React Query hooks — one place mapping server state to query keys, so
 * cache invalidation (e.g. "setup changed, libraries might now be visible") is
 * declared once instead of scattered across every page that happens to read it.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from './ApiContext.js';

export const queryKeys = {
  setup: ['setup'] as const,
  authMe: ['auth', 'me'] as const,
  libraries: ['libraries'] as const,
  libraryHome: (libraryId: string) => ['libraries', libraryId, 'home'] as const,
  libraryItems: (libraryId: string, page: number) =>
    ['libraries', libraryId, 'items', page] as const,
  librarySearch: (libraryId: string, q: string) => ['libraries', libraryId, 'search', q] as const,
  item: (itemId: string) => ['items', itemId] as const,
};

export function useSetupQuery() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.setup,
    queryFn: ({ signal }) => api.getSetupState(signal),
    staleTime: 10_000,
  });
}

export function useSubmitSetupMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (baseUrl: string) => api.submitSetup(baseUrl),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.setup }),
  });
}

export function useLoginMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      api.login(username, password),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.authMe }),
  });
}

export function useLogoutMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => queryClient.clear(),
  });
}

export function useLibrariesQuery(enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.libraries,
    queryFn: ({ signal }) => api.getLibraries(signal),
    enabled,
    staleTime: 60_000,
  });
}

export function useLibraryHomeQuery(libraryId: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.libraryHome(libraryId),
    queryFn: ({ signal }) => api.getLibraryHome(libraryId, signal),
    staleTime: 30_000,
  });
}

export function useLibraryItemsQuery(libraryId: string, page = 0) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.libraryItems(libraryId, page),
    queryFn: ({ signal }) => api.getLibraryItems(libraryId, { page, limit: 40 }, signal),
    staleTime: 30_000,
  });
}

export function useItemQuery(itemId: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.item(itemId),
    queryFn: ({ signal }) => api.getItem(itemId, signal),
    staleTime: 30_000,
  });
}

export function useLibrarySearchQuery(libraryId: string | undefined, q: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.librarySearch(libraryId ?? '', q),
    queryFn: ({ signal }) => api.searchLibrary(libraryId!, q, signal),
    enabled: Boolean(libraryId) && q.trim().length > 0,
    staleTime: 10_000,
  });
}
