/**
 * PWA lifecycle state — whether a new service-worker build is waiting, and
 * whether the offline shell has finished its first cache. Session-only, and
 * deliberately separate from `uiStore`: this is wired up once, from outside
 * React, by `pwa/registerServiceWorker.ts`.
 */
import { create } from 'zustand';

export interface PwaState {
  updateAvailable: boolean;
  offlineReady: boolean;
  /** Set by `registerServiceWorker` once the SW registration resolves. */
  applyUpdate: (() => void) | null;
}

export const usePwaStore = create<PwaState>(() => ({
  updateAvailable: false,
  offlineReady: false,
  applyUpdate: null,
}));
