import { Button } from '@auralis/ui';
import { usePwaStore } from '../state/pwaStore.js';

/** "A new version is available" — the PWA update prompt (docs deliverable: PWA § update prompt). */
export function UpdateBanner() {
  const updateAvailable = usePwaStore((s) => s.updateAvailable);
  const applyUpdate = usePwaStore((s) => s.applyUpdate);

  if (!updateAvailable) return null;

  return (
    <div className="auralis-update-banner" role="status" data-testid="update-banner">
      <span>A new version of Auralis is available.</span>
      <Button variant="tonal" size="sm" onClick={() => applyUpdate?.()} data-testid="update-banner-reload">
        Reload to update
      </Button>
    </div>
  );
}
