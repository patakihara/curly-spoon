/**
 * Pure keyboard-shortcut matching (docs/DESIGN.md § Accessibility): given the
 * currently-pressed key and whether a `g` chord is pending, decides what action
 * (if any) fires, and the next chord state. Kept separate from the
 * `useKeyboardShortcuts` hook (which owns the actual `keydown` listener and the
 * chord timeout) so the matching rules are unit-testable without a DOM.
 */

export type ShortcutAction = 'focus-search' | 'open-shortcut-sheet' | 'go-home' | 'go-library';

export interface ShortcutMatch {
  action: ShortcutAction | null;
  /** Whether a `g` chord should now be armed, awaiting a second key. */
  chordPending: boolean;
}

/**
 * `key` is the raw `KeyboardEvent.key`. `chordPending` is whatever the previous
 * call returned as `chordPending` (or `false` initially, or after the caller's
 * own chord timeout has elapsed).
 */
export function matchShortcut(key: string, chordPending: boolean): ShortcutMatch {
  if (chordPending) {
    if (key === 'h') return { action: 'go-home', chordPending: false };
    if (key === 'l') return { action: 'go-library', chordPending: false };
    // Any other key while a chord is armed cancels it without firing anything.
    return { action: null, chordPending: false };
  }

  if (key === 'g') return { action: null, chordPending: true };
  if (key === '/') return { action: 'focus-search', chordPending: false };
  if (key === '?') return { action: 'open-shortcut-sheet', chordPending: false };
  return { action: null, chordPending: false };
}

/**
 * True when a `keydown` on `target` should be ignored — the user is typing, not
 * navigating. Duck-typed rather than an `instanceof HTMLElement` check so this
 * stays unit-testable with a plain object in Vitest's DOM-less Node environment,
 * while still working against a real element in the browser.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as { tagName?: unknown; isContentEditable?: unknown } | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true;
}
