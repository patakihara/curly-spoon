/**
 * Registers the service worker `vite-plugin-pwa` generates and wires its two
 * lifecycle callbacks into `usePwaStore`, so `UpdateBanner` can render an
 * "update available" prompt instead of the update silently applying (or never
 * applying — the classic PWA staleness bug) underneath the user.
 */
import { registerSW } from 'virtual:pwa-register';
import { usePwaStore } from '../state/pwaStore.js';

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  const updateSW = registerSW({
    onNeedRefresh() {
      usePwaStore.setState({ updateAvailable: true, applyUpdate: () => void updateSW(true) });
    },
    onOfflineReady() {
      usePwaStore.setState({ offlineReady: true });
    },
  });
}
