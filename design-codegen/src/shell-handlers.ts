/**
 * What the shell's own controls do, as 11-front.md's "Shell and navigation" says, in one place
 * both apps' page generators read, so the web and Android cannot wire them differently. Each
 * generator only spells an action in its own language.
 *
 * - ✕ returns to whatever opened the page, or, with nothing under it, to the home of the
 *   destination it lights (Browse for a page that lights none). A player sheet closes the same
 *   way, to the page under it.
 * - The bottom bar and the rail open the destination tapped, on its own stack as it was left.
 * - The rail's hamburger collapses the labelled rail to the icon rail and back, and it stays so
 *   from page to page.
 * - The mini-player opens Now Playing.
 * - The player's tabs switch to that tab's sheet.
 */
import type { Nav, NavPage } from './nav.js';
import type { PageTree } from './page.js';
import type { Chrome } from './shell.js';

export type ShellAction =
  /** Back to the opener, or else to `home`'s page, the destination the page lights. */
  | { kind: 'close'; home: string }
  /** The destination the handler is given, by its key, on its own stack. */
  | { kind: 'destination' }
  /** The page `page`, pushed over this one. */
  | { kind: 'open'; page: string }
  /** The player sheet of the tab the handler is given. */
  | { kind: 'tab' }
  /** The rail collapsed or expanded, from `expanded`, the width's own default, until toggled. */
  | { kind: 'rail'; expanded: boolean };

/** The shell's handlers on a page's shell elements, each element's handler props to their actions. */
export type ShellHandlers = Map<PageTree, Record<string, ShellAction>>;

function find(tree: PageTree | undefined, component: string): PageTree | undefined {
  if (tree === undefined) return undefined;
  if (tree.kind === 'element' && tree.component === component) return tree;
  if (!('children' in tree)) return undefined;
  for (const child of tree.children) {
    const found = find(child, component);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * What closing `page` does, from its close control, its player's, or Android's back: nothing on a
 * page that does not close.
 */
export function closeAction(nav: Nav, page: NavPage): ShellAction | undefined {
  if (page.close === 'none') return undefined;
  return { kind: 'close', home: page.lights ?? nav.destinations[0]!.id };
}

/**
 * The handlers of `page`'s shell: its `chrome` at one layout for a screen, or the `player` a
 * sheet's page is drawn in. `platform` leaves out a page it does not have to open.
 */
export function shellHandlers(
  nav: Nav,
  page: NavPage,
  shell: { chrome?: Chrome; player?: PageTree },
  platform: 'web' | 'android' = 'web',
): ShellHandlers {
  const handlers: ShellHandlers = new Map();
  const on = (tree: PageTree | undefined, prop: string, action: ShellAction) => {
    if (tree !== undefined) handlers.set(tree, { ...handlers.get(tree), [prop]: action });
  };
  const has = (id: string) => nav.pages.some((p) => p.id === id && p.platforms.includes(platform));
  const close = closeAction(nav, page);
  if (shell.player !== undefined) {
    if (close !== undefined) on(shell.player, 'onClose', close);
    on(shell.player, 'onTabChange', { kind: 'tab' });
  }
  const parts = shell.chrome;
  if (parts !== undefined) {
    if (close !== undefined) on(parts.leading, 'onClick', close);
    on(find(parts.player, 'BottomNav'), 'onChange', { kind: 'destination' });
    on(parts.rail, 'onChange', { kind: 'destination' });
    const rail = parts.rail?.kind === 'element' ? parts.rail.props : {};
    if (rail['toggle']?.kind === 'literal' && rail['toggle'].value === true) {
      const expanded = rail['expanded'];
      on(parts.rail, 'onToggleExpanded', {
        kind: 'rail',
        expanded: expanded?.kind === 'literal' ? expanded.value === true : true,
      });
    }
    if (has('nowPlaying'))
      on(find(parts.player, 'MiniPlayer'), 'onOpen', { kind: 'open', page: 'nowPlaying' });
    on(parts.sheet, 'onTabChange', { kind: 'tab' });
  }
  return handlers;
}
