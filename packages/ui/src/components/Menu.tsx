/**
 * Context menu — right-click and long-press on a row, plus a real keyboard-openable
 * trigger. Thin wrapper around Mantine's `Menu`, which already provides real ARIA menu
 * semantics (`role="menu"`/`"menuitem"`, arrow-key navigation, Escape-to-close) and, as of
 * Mantine 9, a `Menu.ContextMenu` sub-component that handles right-click *and* touch
 * long-press itself (`@mantine/core`'s `useContextMenuHandlers`: `onContextMenu` +
 * `@mantine/hooks`' `useLongPress` on `touchstart`/`touchmove`/`touchend`, cancelled on
 * move) — hand-rolling that pointer-event bookkeeping here would just be a worse copy of
 * code Mantine already ships and tests.
 *
 * `Menu.ContextMenu`'s child (`children` below — the whole row) is where right-click/
 * long-press are recognised; a separate `Menu.Target` (re-exported as `MenuTarget`, meant
 * to wrap a visible "more actions" `IconButton` nested *inside* that row) is what makes the
 * menu openable with click or keyboard (Enter/Space on a focused button) — right-click and
 * long-press alone cannot satisfy "openable without a mouse". Both feed the same Popover
 * floating reference: opening via the button anchors the dropdown to the button; opening via
 * right-click/long-press repositions that same reference to the cursor/touch point first.
 *
 * `returnFocus` (Mantine's default: `true`) is what sends focus back to whichever element
 * opened the menu when it closes (Escape, item selection, outside click) — since the
 * keyboard-accessible trigger is a real button, this "just works" rather than needing manual
 * `ref.focus()` bookkeeping. `respectReducedMotion: true` is already set on
 * `ThemeProvider.tsx`'s Mantine theme, which — unlike `Skeleton`'s hand-rolled `@keyframes`
 * shimmer (see that component's own doc comment) — *does* cover `Menu`'s dropdown, since its
 * open/close animation runs through Mantine's own JS-driven `Transition` machinery; no
 * separate reduced-motion wiring is needed here.
 */
import type { ReactNode } from 'react';
import { Menu as MantineMenu } from '@mantine/core';
import './Menu.css';

export interface MenuItemDescriptor {
  key: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

export interface MenuProps {
  opened: boolean;
  onOpenChange: (opened: boolean) => void;
  items: MenuItemDescriptor[];
  /** Accessible name for the dropdown's `role="menu"` region. */
  'aria-label': string;
  /** The row (a single element) that opens this menu on right-click or long-press. Must
   *  contain a nested `MenuTarget`-wrapped button somewhere for keyboard/click access. */
  children: ReactNode;
  /** Touch long-press duration before the menu opens, ms. Matches Mantine's own default
   *  (500) unless overridden — exposed for tests that want a shorter wait. */
  longPressDelay?: number;
}

export function Menu({
  opened,
  onOpenChange,
  items,
  'aria-label': ariaLabel,
  children,
  longPressDelay = 500,
}: MenuProps) {
  return (
    <MantineMenu opened={opened} onChange={onOpenChange} withinPortal shadow="md">
      <MantineMenu.ContextMenu longPressDelay={longPressDelay}>{children}</MantineMenu.ContextMenu>
      <MantineMenu.Dropdown aria-label={ariaLabel} className="m3-menu-dropdown">
        {items.map((item) => (
          <MantineMenu.Item
            key={item.key}
            disabled={item.disabled}
            onClick={item.onSelect}
            className="m3-menu-item"
          >
            {item.label}
          </MantineMenu.Item>
        ))}
      </MantineMenu.Dropdown>
    </MantineMenu>
  );
}

/** Wraps the visible "more actions" button that makes a `Menu` openable by click or
 *  keyboard — nest it somewhere inside `Menu`'s own `children` (the row), around an
 *  `IconButton`. Re-exported directly rather than copied: it's already a thin context
 *  consumer with no styling of its own to wrap. */
export const MenuTarget = MantineMenu.Target;
