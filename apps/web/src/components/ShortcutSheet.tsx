import { Sheet } from '@auralis/ui';
import { useUiStore } from '../state/uiStore.js';

const SHORTCUTS: Array<{ keys: string; description: string }> = [
  { keys: '/', description: 'Focus search' },
  { keys: 'g then h', description: 'Go to Home' },
  { keys: 'g then l', description: 'Go to your library' },
  { keys: '?', description: 'Show this list' },
];

/** The `?` shortcut sheet — also documents every shortcut it triggers alongside. */
export function ShortcutSheet() {
  const open = useUiStore((s) => s.shortcutSheetOpen);
  const close = useUiStore((s) => s.closeShortcutSheet);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title="Keyboard shortcuts"
      aria-label="Keyboard shortcuts"
    >
      <dl className="auralis-shortcut-list" data-testid="shortcut-sheet">
        {SHORTCUTS.map((shortcut) => (
          <div className="auralis-shortcut-list__row" key={shortcut.keys}>
            <dt>
              <kbd>{shortcut.keys}</kbd>
            </dt>
            <dd>{shortcut.description}</dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
