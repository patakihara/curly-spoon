import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { matchPath, useLocation, useNavigate, useNavigationType } from 'react-router';
import { PANEL, useLayout } from './generated/nav/platform';
import { NAV_MAP } from './generated/nav/stacks';

/**
 * The shell's navigation on the web, as 11-front.md's "Shell and navigation" says and the Android
 * graph's `closePage`, `openDestination` and `openTab` do: ✕ returns to whatever opened a page, or
 * with nothing under it to its destination's home; each destination keeps its own stack; a sheet
 * closes to the page under it; the browser's back goes to the previous view, wherever that was.
 * The rail and the bottom bar light the destination whose stack holds the page, the one it was
 * opened from, and the destination the page lights only when nothing is under it.
 * The rail's hamburger collapses the rail and back, and it stays so from page to page. On desktop
 * the player panel's tab is held apart from the page, never in its route: the mini-player's Queue
 * and Lyrics show the panel at that tab, and where the layout holds the player in the panel, the
 * mini-player's track block and the panel's tabs set it too, and a player sheet's route shows its
 * tab in the panel beside the page under it. The stacks, the rail and the panel are kept in the
 * tab's session storage, so a reload carries on where it was. The generated pages wire the
 * shell's controls to it, as design-codegen's shell-handlers say.
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

/** How many history entries keep the destination decided for them, the latest first. */
const REMEMBERED = 100;

/**
 * The key the router gives every page it loads afresh, typed or reloaded, before anything is
 * pushed: the same for each, so what it was decided for is never carried into another load.
 */
const LOADED = 'default';

/** What the stacks need of nav.json, generated into `generated/nav/stacks.ts`. */
export interface NavMap {
  /** Each destination's home, by its key. */
  homes: Readonly<Record<string, string>>;
  /** The pages at the rail's foot, by key: opened over the page showing, not as destinations. */
  foot: Readonly<Record<string, string>>;
  /** Each of the player's tabs, by key, to its sheet. */
  tabs: Readonly<Record<string, string>>;
  /**
   * Each web page: its route path, the destination it lights, whether it is a player sheet, and
   * whether a stack keeps it, as it keeps no page never returned to (not found, sign-in, setup).
   */
  pages: readonly { path: string; lights: string | null; sheet: boolean; kept: boolean }[];
}

/** How the router reached a location, as `useNavigationType` says. */
type Arrival = 'PUSH' | 'POP' | 'REPLACE';

/**
 * What a history entry remembers: the destination decided for it, none (`''`) where its page lit
 * none, and the stack it was filed into as it was then, its location on top.
 */
interface Entry {
  destination: string;
  stack?: string[];
}

/** One stack of locations per destination, its home at the bottom, and the one in use. */
export class Stacks {
  private readonly stacks = new Map<string, string[]>();
  private current: string;
  /** Whether any destination is in use yet: not in a fresh tab before its first page. */
  private inUse = false;
  private last: string | undefined;
  /** The location showing, as last seen. */
  private showing: string | undefined;
  /** Each recent history entry's own, by its key, the oldest first. */
  private readonly entries = new Map<string, Entry>();
  /** The key of the arrival whose page lit the rail by the stacks, as `lit` was asked for it. */
  private asked: string | undefined;

  /**
   * Stacks for `map`, carried on from what `store` holds of an earlier load of this tab, cleaned
   * of what an older build may have kept there: pages no stack keeps, entries that are no path,
   * and stacks not starting at their destination's home.
   */
  constructor(
    private readonly map: NavMap,
    private readonly store?: Store,
  ) {
    const first = Object.keys(map.homes)[0];
    if (first === undefined) throw new Error('nav.json has no destinations');
    this.current = first;
    const kept = stored(store) as
      { current?: unknown; stacks?: unknown; entries?: unknown } | undefined;
    if (typeof kept?.current !== 'string' || map.homes[kept.current] === undefined) return;
    if (typeof kept.stacks !== 'object' || kept.stacks === null) return;
    this.current = kept.current;
    this.inUse = true;
    for (const [d, stack] of Object.entries(kept.stacks)) {
      const clean = this.clean(d, stack);
      if (clean !== undefined) this.stacks.set(d, clean);
    }
    if (Array.isArray(kept.entries))
      for (const pair of kept.entries.slice(-REMEMBERED)) {
        if (!Array.isArray(pair) || typeof pair[0] !== 'string') continue;
        const entry = pair[1] as { destination?: unknown; stack?: unknown } | null;
        const destination = entry?.destination;
        if (typeof destination !== 'string') continue;
        if (destination !== '' && map.homes[destination] === undefined) continue;
        const stack = destination === '' ? undefined : this.clean(destination, entry?.stack);
        this.entries.set(pair[0], stack === undefined ? { destination } : { destination, stack });
      }
    this.save();
  }

  /**
   * `stack`, as kept for destination `d`, with only the locations a stack may keep, starting at
   * `d`'s home; none where `d` is no destination or `stack` is no list.
   */
  private clean(d: string, stack: unknown): string[] | undefined {
    const home = this.map.homes[d];
    if (home === undefined || !Array.isArray(stack)) return undefined;
    const homes = new Set(Object.values(this.map.homes));
    const paths = stack.filter(
      (l): l is string =>
        typeof l === 'string' && l.startsWith('/') && !homes.has(l) && this.page(l)?.kept === true,
    );
    return [home, ...paths];
  }

  private save(): void {
    this.store?.write(
      JSON.stringify({
        current: this.current,
        stacks: Object.fromEntries(this.stacks),
        entries: [...this.entries].filter(([key]) => key !== LOADED),
      }),
    );
  }

  /** Remembers `entry` for history entry `key`, as the latest. */
  private remember(key: string, entry: Entry): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
    for (const old of this.entries.keys()) {
      if (this.entries.size <= REMEMBERED) break;
      this.entries.delete(old);
    }
  }

  private stack(destination: string): string[] {
    let stack = this.stacks.get(destination);
    if (stack === undefined) {
      stack = [this.map.homes[destination]!];
      this.stacks.set(destination, stack);
    }
    return stack;
  }

  /** The page at `location`: the one its path matches, or else the page for a link to nothing. */
  private page(location: string) {
    const pathname = location.split('?')[0]!;
    return (
      this.map.pages.find(
        (p) => p.path !== '*' && matchPath({ path: p.path, end: true }, pathname) !== null,
      ) ?? this.map.pages.find((p) => p.path === '*')
    );
  }

  /** A location the router reached; `key` is its history entry's, so each is recorded once. */
  seen(location: string, arrival: Arrival, key: string): void {
    if (key === this.last) return;
    this.last = key;
    const destination = this.decide(location, arrival, key, this.page(location)?.lights);
    const under = this.showing;
    this.showing = location;
    this.record(location, arrival, destination || this.current, under, key);
    this.inUse = true;
    this.save();
  }

  /**
   * The destination an arrival at `location` belongs to, decided once for its history entry `key`
   * and remembered with it, the same however often it is asked and when the browser's back or
   * forward, or a reload, comes to that entry again: a destination's home is that destination's,
   * from wherever it is reached; a page no stack keeps lights the destination in use; a page
   * pushed or replaced joins the destination in use, the one it was opened from; the browser's
   * back or forward goes to the stack that holds it; and a page with nothing under it, as from a
   * link from outside the app or in a fresh tab, to `fallback`, or else to the destination in
   * use, or none (`''`) for a page no stack keeps.
   */
  private decide(
    location: string,
    arrival: Arrival,
    key: string,
    fallback: string | null | undefined,
  ): string {
    const remembered = this.entries.get(key);
    if (remembered !== undefined) return remembered.destination;
    const given = fallback != null && this.map.homes[fallback] !== undefined ? fallback : undefined;
    const destination =
      Object.keys(this.map.homes).find((d) => this.map.homes[d] === location) ??
      (this.page(location)?.kept === false
        ? this.inUse
          ? this.current
          : (given ?? '')
        : ((arrival === 'POP'
            ? [this.current, ...this.stacks.keys()].find((d) =>
                this.stacks.get(d)?.includes(location),
              )
            : this.current) ??
          given ??
          this.current));
    this.remember(key, { destination });
    return destination;
  }

  /**
   * Files `location`, history entry `key`, into the stack of `destination`, now the one in use;
   * `under` showed before. The browser's back or forward to an entry whose stack has since moved
   * on puts the stack back as that entry left it.
   */
  private record(
    location: string,
    arrival: Arrival,
    destination: string,
    under: string | undefined,
    key: string,
  ): void {
    this.current = destination;
    if (this.page(location)?.kept === false) return;
    const stack = this.stack(destination);
    const at = stack.lastIndexOf(location);
    const before = this.entries.get(key)?.stack;
    if (location === this.map.homes[destination]) stack.length = 1;
    else if (stack.at(-1) === location) {
      // Already on top: a page reporting the location it showed.
    } else if (arrival === 'REPLACE' && stack.at(-1) === under) stack[stack.length - 1] = location;
    else if (arrival === 'POP' && at >= 0) stack.length = at + 1;
    else if (arrival === 'POP' && before?.at(-1) === location) stack.splice(0, Infinity, ...before);
    else stack.push(location);
    this.remember(key, { destination, stack: [...stack] });
  }

  /**
   * The destination the rail and the bottom bar light at `where`, reached by `arrival` as history
   * entry `key`: the one that arrival is filed under, decided as the page first renders, before
   * the location is recorded, and never changing for that arrival. `fallback` is the destination
   * the page lights when nothing is under it, as from a link from outside the app; a player
   * sheet's location is not the asking page's own, so there it goes to the destination in use.
   */
  lit(where: string, arrival: Arrival, key: string, fallback: string): string {
    this.asked = key;
    return this.decide(where, arrival, key, this.page(where)?.sheet === true ? null : fallback);
  }

  /** Closes the page showing: where to go, its opener, or else `home`'s home with nothing under it. */
  close(home: string): string {
    const stack = this.stack(this.current);
    if (this.showing !== undefined && this.page(this.showing)?.kept === false) {
      // A page no stack keeps closes to the page it was opened over, the top of the stack.
    } else if (stack.length > 1) {
      stack.pop();
    } else {
      this.current = home;
      this.stacks.set(home, [this.map.homes[home]!]);
    }
    this.save();
    return this.stack(this.current).at(-1)!;
  }

  /**
   * The destination tapped: its home when it is the one lit, from any page of its own; any other
   * as it was left; a page at the rail's foot opens over this one. None when that is the location
   * showing, so tapping it again adds nothing to the browser's history. A page the rail lights
   * itself for, as Settings over Browse, is left behind, so the tap is never a dead one.
   */
  destination(key: string): string | undefined {
    let to = this.map.foot[key];
    if (to === undefined) {
      if (this.map.homes[key] === undefined) throw new Error(`${key} is not a destination`);
      const lit =
        this.asked === this.last ? this.entries.get(this.last ?? '')?.destination : undefined;
      this.current = key;
      const stack = this.stack(key);
      if (key === lit) stack.length = 1;
      else if (stack.length > 1 && stack.at(-1) === this.showing) stack.pop();
      this.save();
      to = stack.at(-1)!;
    }
    return to === this.showing ? undefined : to;
  }

  /**
   * The player sheet showing taken off its stack, where the layout holds the player in the panel
   * beside the page: the location under it.
   */
  underSheet(): string {
    const stack = this.stack(this.current);
    while (stack.length > 1 && this.page(stack.at(-1)!)?.sheet === true) stack.pop();
    this.save();
    return stack.at(-1)!;
  }

  /** A tab of the full-screen player: its sheet, in place of the sheet showing. */
  tab(tab: string): string {
    const to = this.map.tabs[tab];
    if (to === undefined) throw new Error(`${tab} is not a tab of the player`);
    const stack = this.stack(this.current);
    stack[stack.length - 1] = to;
    this.save();
    return to;
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
 * The player panel's tab on desktop, its one source, apart from the page: none until one is set,
 * so each width shows its own panel, if any; then the mini-player's Queue or Lyrics tapped, or Now
 * Playing when that tab already shows; from then the panel's own tabs and its close.
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

/** The tab of the player whose sheet is at `location`, if it is one. */
const tabAt = (location: string): string | undefined =>
  Object.keys(NAV_MAP.tabs).find((tab) => NAV_MAP.tabs[tab] === location.split('?')[0]);

/** The history entry whose player sheet was last moved into the panel, so it moves once. */
let moved: string | undefined;

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
  /**
   * The destination the rail and the bottom bar light: the one whose stack holds the page, the
   * opener's, or `fallback`, the one the page lights, when nothing is under it.
   */
  lit(fallback: string): string;
  /** A page over this one: the mini-player's Now Playing, in the panel where the layout holds one. */
  open(path: string): void;
  /** The player's tab `tab`. */
  tab(tab: string): void;
  /** The player panel's tab the mini-player's Queue or Lyrics set, or none. */
  panel(): string | undefined;
  /** The desktop mini-player's Queue or Lyrics, `tab`. */
  togglePanel(tab: string): void;
  /** The scrim behind the panel, where it sits over the page, tapped: no panel, the page as it was. */
  closePanel(): void;
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
  const panelled = PANEL[useLayout()];
  useEffect(() => {
    const where = location.pathname + location.search;
    stacks.seen(where, arrival, location.key);
    // A player sheet's route where the panel is the layout's own: its tab, in the panel. The page
    // under it is drawn in the same task the location changes, not in a transition that leaves
    // the page the sheet's route opens over showing at the new location for a second or more;
    // from a microtask, since React cannot flush while it is still committing this effect.
    const sheet = tabAt(where);
    if (!panelled || sheet === undefined || moved === location.key) return;
    moved = location.key;
    panel.show(sheet);
    const under = stacks.underSheet();
    queueMicrotask(() => void navigate(under, { replace: true, flushSync: true }));
  }, [location, arrival, panelled, navigate]);
  return useMemo(
    () => ({
      close: (home) => (inPanel ? panel.close() : void navigate(stacks.close(home))),
      destination: (key) => {
        const to = stacks.destination(key);
        if (to !== undefined) void navigate(to);
      },
      lit: (fallback) =>
        stacks.lit(location.pathname + location.search, arrival, location.key, fallback),
      open: (path) => {
        const sheet = tabAt(path);
        if (panelled && sheet !== undefined) panel.show(sheet);
        else void navigate(path);
      },
      tab: (to) => {
        if (inPanel || panelled) panel.show(to);
        else void navigate(stacks.tab(to), { replace: true });
      },
      panel: () => tab,
      togglePanel: (to) => panel.toggle(to),
      closePanel: () => panel.close(),
      rail: (given) => held ?? given,
      toggleRail: (given) => rail.toggle(given),
    }),
    [navigate, location, arrival, held, tab, inPanel, panelled],
  );
}
