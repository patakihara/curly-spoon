import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { matchPath, useLocation, useNavigate, useNavigationType } from 'react-router';
import { NAV_MAP } from './generated/nav/stacks';

/**
 * The shell's navigation on the web, as 11-front.md's "Shell and navigation" says and the Android
 * graph's `closePage`, `openDestination` and `openTab` do: ✕ returns to whatever opened a page, or
 * with nothing under it to its destination's home; each destination keeps its own stack; a sheet
 * closes to the page under it; the browser's back goes to the previous view, wherever that was.
 * The rail's hamburger collapses the rail and back, and it stays so from page to page. On desktop
 * the mini-player's Queue and Lyrics show the player panel at that tab, its tab held apart from the
 * page, which stays as it is. The stacks, the rail and the panel are kept in the tab's session
 * storage, so a reload carries on where it was. The generated pages wire the shell's controls to
 * it, as design-codegen's shell-handlers say.
 */

/** Somewhere to keep a value across a reload: the tab's session storage, in the app. */
export interface Store {
  read(): string | null;
  write(value: string): void;
}

/** The tab's session storage under `key`; nothing kept where the browser refuses it. */
function session(key: string): Store {
  return {
    read: () => {
      try {
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    write: (value) => {
      try {
        sessionStorage.setItem(key, value);
      } catch {
        // Private windows and full storage keep nothing; the app still works for this load.
      }
    },
  };
}

/** A stored value, or undefined if nothing readable is stored. */
function stored(store: Store | undefined): unknown {
  try {
    return JSON.parse(store?.read() ?? 'null') ?? undefined;
  } catch {
    return undefined;
  }
}

const isPaths = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string');

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
  /** The location showing, as last seen. */
  private showing: string | undefined;

  /** Stacks for `map`, carried on from what `store` holds of an earlier load of this tab. */
  constructor(
    private readonly map: NavMap,
    private readonly store?: Store,
  ) {
    const first = Object.keys(map.homes)[0];
    if (first === undefined) throw new Error('nav.json has no destinations');
    this.current = first;
    const kept = stored(store) as { current?: unknown; stacks?: unknown } | undefined;
    const stacks = kept?.stacks;
    if (typeof kept?.current !== 'string' || map.homes[kept.current] === undefined) return;
    if (typeof stacks !== 'object' || stacks === null) return;
    const entries = Object.entries(stacks).filter(
      ([d, stack]) => map.homes[d] !== undefined && isPaths(stack),
    );
    this.current = kept.current;
    for (const [d, stack] of entries) this.stacks.set(d, [...(stack as string[])]);
  }

  private save(): void {
    this.store?.write(
      JSON.stringify({ current: this.current, stacks: Object.fromEntries(this.stacks) }),
    );
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
    this.showing = location;
    this.record(location, arrival);
    this.save();
  }

  private record(location: string, arrival: Arrival): void {
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
    } else {
      this.current = home;
      this.stacks.set(home, [this.map.homes[home]!]);
    }
    this.save();
    return this.stack(this.current).at(-1)!;
  }

  /**
   * The destination tapped, as it was left; a page at the rail's foot opens over this one. None
   * when that is the location showing, so tapping it again adds nothing to the browser's history.
   */
  destination(key: string): string | undefined {
    let to = this.map.foot[key];
    if (to === undefined) {
      if (this.map.homes[key] === undefined) throw new Error(`${key} is not a destination`);
      this.current = key;
      this.save();
      to = this.stack(key).at(-1)!;
    }
    return to === this.showing ? undefined : to;
  }

  /** A tab of the player: its sheet in place of the sheet showing, or else over the page. */
  tab(tab: string): { to: string; replace: boolean } {
    const to = this.map.tabs[tab];
    if (to === undefined) throw new Error(`${tab} is not a tab of the player`);
    const stack = this.stack(this.current);
    if (this.page(stack.at(-1)!)?.sheet !== true) return { to, replace: false };
    stack[stack.length - 1] = to;
    this.save();
    return { to, replace: true };
  }
}

/**
 * Whether the rail is expanded: each width's own default, the labelled rail's expanded and the
 * icon rail's not, until its hamburger is tapped; from then what that tap made it, on every page.
 */
export class Rail {
  private held: boolean | undefined;
  private readonly heard = new Set<() => void>();

  constructor(private readonly store?: Store) {
    const kept = stored(store);
    if (typeof kept === 'boolean') this.held = kept;
  }

  /** Whether the rail is expanded, at a width whose default is `given`. */
  expanded(given: boolean): boolean {
    return this.held ?? given;
  }

  /** The hamburger tapped, at a width whose default is `given`. */
  toggle(given: boolean): void {
    this.held = !this.expanded(given);
    this.store?.write(JSON.stringify(this.held));
    for (const listener of this.heard) listener();
  }

  /** Calls `listener` whenever the hamburger is tapped; returns what stops it. */
  subscribe(listener: () => void): () => void {
    this.heard.add(listener);
    return () => void this.heard.delete(listener);
  }

  /** What the rail's state is now, for React to tell when it has changed. */
  snapshot(): boolean | undefined {
    return this.held;
  }
}

/**
 * The player panel's tab, as the desktop mini-player's Queue and Lyrics set it, apart from the
 * page: none until one is tapped, so each width shows its own panel, if any; then the tab tapped,
 * or Now Playing when that tab already shows; from then the panel's own tabs and its close.
 */
export class Panel {
  private held: string | undefined;
  private readonly heard = new Set<() => void>();

  /** A panel of the player's `tabs`, by key, carried on from what `store` holds. */
  constructor(
    private readonly tabs: Readonly<Record<string, string>>,
    private readonly store?: Store,
  ) {
    const kept = stored(store);
    if (typeof kept === 'string' && tabs[kept] !== undefined) this.held = kept;
  }

  /** The tab held, or none. */
  tab(): string | undefined {
    return this.held;
  }

  /** The mini-player's `tab` tapped: the panel at it, or at Now Playing when it shows it already. */
  toggle(tab: string): void {
    this.show(this.held === tab ? 'now' : tab);
  }

  /** The panel's own tab `tab`. */
  show(tab: string): void {
    if (this.tabs[tab] === undefined) throw new Error(`${tab} is not a tab of the player`);
    this.hold(tab);
  }

  /** The panel's close: no tab held, so the width's own panel, if any, shows again. */
  close(): void {
    this.hold(undefined);
  }

  private hold(tab: string | undefined): void {
    this.held = tab;
    this.store?.write(JSON.stringify(tab ?? null));
    for (const listener of this.heard) listener();
  }

  /** Calls `listener` whenever the tab held changes; returns what stops it. */
  subscribe(listener: () => void): () => void {
    this.heard.add(listener);
    return () => void this.heard.delete(listener);
  }
}

const stacks = new Stacks(NAV_MAP, session('auralis.shell.stacks'));
const rail = new Rail(session('auralis.shell.rail'));
const panel = new Panel(NAV_MAP.tabs, session('auralis.shell.panel'));

/**
 * Whether what is drawn is the player panel the mini-player's Queue or Lyrics showed: there the
 * player's close and tabs act on the panel and leave the page as it is.
 */
export const InPanel = createContext(false);

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
  /** The player panel's tab the mini-player's Queue or Lyrics set, or none. */
  panel(): string | undefined;
  /** The desktop mini-player's Queue or Lyrics, `tab`. */
  togglePanel(tab: string): void;
  /** Whether the rail is expanded, at a width whose own default is `given`. */
  rail(given: boolean): boolean;
  /** The rail's hamburger, at a width whose own default is `given`. */
  toggleRail(given: boolean): void;
}

/** The shell's navigation, recording each location the page is shown at into the stacks. */
export function useShellNav(): ShellNav {
  const navigate = useNavigate();
  const location = useLocation();
  const arrival = useNavigationType();
  const held = useSyncExternalStore(
    (listener) => rail.subscribe(listener),
    () => rail.snapshot(),
    () => undefined,
  );
  const tab = useSyncExternalStore(
    (listener) => panel.subscribe(listener),
    () => panel.tab(),
    () => undefined,
  );
  const inPanel = useContext(InPanel);
  useEffect(() => {
    stacks.seen(location.pathname + location.search, arrival, location.key);
  }, [location, arrival]);
  return useMemo(
    () => ({
      close: (home) => (inPanel ? panel.close() : void navigate(stacks.close(home))),
      destination: (key) => {
        const to = stacks.destination(key);
        if (to !== undefined) void navigate(to);
      },
      open: (path) => void navigate(path),
      tab: (to) => {
        if (inPanel) return panel.show(to);
        const sheet = stacks.tab(to);
        void navigate(sheet.to, { replace: sheet.replace });
      },
      panel: () => tab,
      togglePanel: (to) => panel.toggle(to),
      rail: (given) => held ?? given,
      toggleRail: (given) => rail.toggle(given),
    }),
    [navigate, held, tab, inPanel],
  );
}
