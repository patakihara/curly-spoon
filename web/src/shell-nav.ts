import { useEffect, useMemo } from 'react';
import { matchPath, useLocation, useNavigate, useNavigationType } from 'react-router';
import { NAV_MAP } from './generated/nav/stacks';

/**
 * The shell's navigation on the web, as 12-front.md's "Shell and navigation" says and the Android
 * graph's `closePage`, `openDestination` and `openTab` do: ✕ returns to whatever opened a page, or
 * with nothing under it to its destination's home; each destination keeps its own stack; a sheet
 * closes to the page under it; the browser's back goes to the previous view, wherever that was.
 * The generated pages wire the shell's controls to it, as design-codegen's shell-handlers say.
 */

/** What the stacks need of nav.json, generated into `generated/nav/stacks.ts`. */
export interface NavMap {
  /** Each destination's home, by its key. */
  homes: Readonly<Record<string, string>>;
  /** The pages at the rail's foot, by key: opened over the page showing, not as destinations. */
  foot: Readonly<Record<string, string>>;
  /** Each of the player's tabs, by key, to its sheet. */
  tabs: Readonly<Record<string, string>>;
  /** Each web page: its route path, the destination it lights, and whether it is a player sheet. */
  pages: readonly { path: string; lights: string | null; sheet: boolean }[];
}

/** How the router reached a location, as `useNavigationType` says. */
type Arrival = 'PUSH' | 'POP' | 'REPLACE';

/** One stack of locations per destination, its home at the bottom, and the one in use. */
export class Stacks {
  private readonly stacks = new Map<string, string[]>();
  private current: string;
  private last: string | undefined;

  constructor(private readonly map: NavMap) {
    const first = Object.keys(map.homes)[0];
    if (first === undefined) throw new Error('nav.json has no destinations');
    this.current = first;
  }

  private stack(destination: string): string[] {
    let stack = this.stacks.get(destination);
    if (stack === undefined) {
      stack = [this.map.homes[destination]!];
      this.stacks.set(destination, stack);
    }
    return stack;
  }

  private page(location: string) {
    const pathname = location.split('?')[0]!;
    return this.map.pages.find(
      (p) => p.path !== '*' && matchPath({ path: p.path, end: true }, pathname) !== null,
    );
  }

  /** A location the router reached; `key` is its history entry's, so each is recorded once. */
  seen(location: string, arrival: Arrival, key: string): void {
    if (key === this.last) return;
    this.last = key;
    const stack = this.stack(this.current);
    if (stack.at(-1) === location) return;
    if (arrival === 'PUSH') {
      stack.push(location);
      return;
    }
    if (arrival === 'REPLACE') {
      stack[stack.length - 1] = location;
      return;
    }
    // The browser's back or forward, or the first load: back into a stack where it was left.
    const others = [...this.stacks.keys()].filter((d) => d !== this.current);
    for (const destination of [this.current, ...others]) {
      const other = this.stack(destination);
      const at = other.lastIndexOf(location);
      if (at >= 0) {
        this.current = destination;
        other.length = at + 1;
        return;
      }
    }
    const lights = this.page(location)?.lights;
    if (lights != null && this.map.homes[lights] !== undefined) this.current = lights;
    const into = this.stack(this.current);
    if (location === this.map.homes[this.current]) into.length = 1;
    else into.push(location);
  }

  /** Closes the page showing: where to go, its opener, or else `home`'s home with nothing under it. */
  close(home: string): string {
    const stack = this.stack(this.current);
    if (stack.length > 1) {
      stack.pop();
      return stack.at(-1)!;
    }
    this.current = home;
    this.stacks.set(home, [this.map.homes[home]!]);
    return this.map.homes[home]!;
  }

  /** The destination tapped, as it was left; a page at the rail's foot opens over this one. */
  destination(key: string): string {
    const foot = this.map.foot[key];
    if (foot !== undefined) return foot;
    if (this.map.homes[key] === undefined) throw new Error(`${key} is not a destination`);
    this.current = key;
    return this.stack(key).at(-1)!;
  }

  /** A tab of the player: its sheet in place of the sheet showing, or else over the page. */
  tab(tab: string): { to: string; replace: boolean } {
    const to = this.map.tabs[tab];
    if (to === undefined) throw new Error(`${tab} is not a tab of the player`);
    const stack = this.stack(this.current);
    if (this.page(stack.at(-1)!)?.sheet !== true) return { to, replace: false };
    stack[stack.length - 1] = to;
    return { to, replace: true };
  }
}

const stacks = new Stacks(NAV_MAP);

/** What the shell's controls do, for a page to wire them to. */
export interface ShellNav {
  /** ✕: back to the opener, or else to the home of `home`, the destination the page lights. */
  close(home: string): void;
  /** The bottom bar's or the rail's item `key`. */
  destination(key: string): void;
  /** A page over this one: the mini-player's Now Playing. */
  open(path: string): void;
  /** The player's tab `tab`. */
  tab(tab: string): void;
}

/** The shell's navigation, recording each location the page is shown at into the stacks. */
export function useShellNav(): ShellNav {
  const navigate = useNavigate();
  const location = useLocation();
  const arrival = useNavigationType();
  useEffect(() => {
    stacks.seen(location.pathname + location.search, arrival, location.key);
  }, [location, arrival]);
  return useMemo(
    () => ({
      close: (home) => void navigate(stacks.close(home)),
      destination: (key) => void navigate(stacks.destination(key)),
      open: (path) => void navigate(path),
      tab: (tab) => {
        const { to, replace } = stacks.tab(tab);
        void navigate(to, { replace });
      },
    }),
    [navigate],
  );
}
