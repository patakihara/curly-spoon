/**
 * The adaptive shell (docs/DESIGN.md § Layout): bottom bar under 600px, a
 * collapsed rail from 600–1240px, an expanded rail with a persistent Now
 * Playing region above that — all driven by the one `useBreakpoint` hook, never
 * a component-local media query.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import {
  Icon,
  IconButton,
  MantineAppShell,
  MantineNavLink,
  NavigationBar,
  SearchField,
  type IconName,
  type NavigationItem,
} from '@auralis/ui';
import { useBreakpoint } from '../hooks/useBreakpoint.js';
import { contentMaxWidth, railWidth } from './shellLayout.js';
import {
  useJellyfinConfigQuery,
  useLibrariesQuery,
  useProvidersQuery,
  useSetupQuery,
} from '../api/queries.js';
import { MiniPlayer } from '../features/player/MiniPlayer.js';
import { NowPlaying } from '../features/player/NowPlaying.js';
import { useAudioElement } from '../features/player/useAudioElement.js';
import { useMediaSession } from '../features/player/useMediaSession.js';
import { installQueueRouter } from '../features/player/queueRouter.js';
import { useProgressSync } from '../features/player/useProgressSync.js';
import { usePlayerStore } from '../state/playerStore.js';
import { useUiStore } from '../state/uiStore.js';
import {
  lookupLibraries,
  lookupProviders,
  visibleDestinations,
  type DestinationKey,
} from './destinations.js';
import { NowPlayingPanel } from './NowPlayingPanel.js';
import { ShortcutSheet } from './ShortcutSheet.js';

const DESTINATION_ICONS: Record<DestinationKey, IconName> = {
  forYou: 'home',
  books: 'book_2',
  podcasts: 'podcasts',
  music: 'music_note',
  search: 'search',
};

/**
 * Wave 16c-2-W-2: the desktop rail's active-destination highlight, one of the two
 * conspicuous non-responders to Settings' accent picker (docs/HANDOVER.md). Mantine's
 * `NavLink` (`NavLink.css`) reads its active fill/text from two CSS custom properties
 * declared inline on its own root — `--nl-bg: var(--mantine-primary-color-light)` and
 * `--nl-color: var(--mantine-primary-color-light-color)` — which resolve against
 * `ThemeProvider.tsx`'s `mantineTheme.colors.auralis`, itself derived from `scheme.primary`
 * (the *old* HCT-generated M3 primary). Since 16c-2-W-1 fixed `--m3-*` at Sonora's values,
 * `scheme.primary` no longer tracks anything the picker changes — this is a second, deeper
 * non-responder than the `--m3-*` reads named in the wave spec, resolved the same way: stop
 * reading it. Setting `--nl-bg`/`--nl-color` inline on the NavLink beats the CSS file's own
 * declaration (equal specificity, later in the cascade — inline always wins in practice
 * here since these are custom properties, not shorthand that could be clobbered piecemeal).
 * `--accent-ink` for the label/icon, not raw `--accent` (SONORA.md's readable-on-surface
 * form, and what the wave spec names explicitly for this exact surface); `--surface-card`
 * for the tint, since no `--m3-*` "container" role is being asked to survive. Both variables
 * are inert unless `NavLink.css`'s `:where([data-active], [aria-current='page'])` selector
 * matches, so applying them unconditionally (active or not) is safe.
 *
 * Known open issue, not fixed here (docs/HANDOVER.md, queue `abbaca2`): `--accent-ink` on
 * `--surface-card` fails WCAG AA (4.5:1) in dark theme at two of the seventeen presets —
 * indigo (4.12:1) and violet (4.35:1), the shipped default — while clearing the 3:1
 * UI-component floor at both. This rail label is genuine *text*, not an icon or a bare
 * fill, so it sits squarely in the pairing that's already flagged as a design question with
 * the product owner, not a fresh one.
 */
const RAIL_ACTIVE_LINK_STYLE = {
  '--nl-bg': 'var(--surface-card)',
  '--nl-color': 'var(--accent-ink)',
} as CSSProperties;

export function Shell({ children }: { children: ReactNode }) {
  const breakpoint = useBreakpoint();
  const location = useLocation();
  const navigate = useNavigate();
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  // Wave 16d-W-1b: `.auralis-shell__content` is now the app's one scroll
  // container (16d-W-1), which quietly turned off the browser's native
  // "reset scroll on navigation" — that behaviour lived on the document, and
  // the document no longer scrolls here. TanStack Router does ship a
  // `scrollRestoration` router option, deliberately not used: it's a
  // session-storage-backed cache of scroll positions keyed by location
  // (`@tanstack/router-core`'s `scroll-restoration.js`), which is exactly
  // the "scroll-position cache" this wave is scoped to *not* build — a
  // bigger, separate piece of work. A plain effect keyed on the pathname is
  // the narrow fix the bug actually needs.
  const contentRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    // Keyed on `pathname` alone, not the whole `location` object: this app
    // has a real search-param route (`/music/requests?prefill=`, seeded by
    // `MusicHomePage`'s recommended-shelf hand-off), and a query-string-only
    // change must not throw the user back to the top of a page they're
    // still on. Nothing in this app navigates by hash today (grepped: no
    // `location.hash` reads, no `hash:` route options) — this app has no
    // hash-navigation surface to defeat, but the guard costs nothing.
    if (location.hash) return;
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [location.pathname]);
  const railSearchQuery = useUiStore((s) => s.query);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);
  // `MiniPlayer` decides its own visibility from this same field (returns
  // null when nothing is loaded). The compact shell needs to know it too, to
  // reserve bottom padding only when the mini player is actually rendered
  // above the bottom nav bar — padding reserved for a bar that isn't there
  // would itself be a bug (app.css's `data-mini-player-active` rule).
  const miniPlayerActive = usePlayerStore((s) => s.currentItem !== null);

  // The single shared `<audio>` element, the OS media-session integration and
  // progress sync — all three take no arguments and read the player store
  // directly, so they only ever need to be mounted once, here, where every
  // signed-in route lives underneath.
  useAudioElement();
  useMediaSession();
  useProgressSync();
  // Subscribes the queue router to `playerStore.currentItem` changes so the right
  // content type's `onTrackEnded` handler is re-attached after every `load()` — see
  // `queueRouter.ts`'s header for the bug this fixes. `installQueueRouter` is idempotent
  // (a module-level guard no-ops a second call), but the subscription is still a side
  // effect that belongs in an effect, not the render body.
  useEffect(() => {
    installQueueRouter();
  }, []);

  const setupQuery = useSetupQuery();
  const audiobookshelfConfigured = setupQuery.data?.configured ?? false;
  const librariesQuery = useLibrariesQuery(audiobookshelfConfigured);
  const lookup = lookupLibraries(librariesQuery.data?.libraries ?? []);
  const providersQuery = useProvidersQuery();
  const providerLookup = lookupProviders(providersQuery.data?.providers ?? []);
  const jellyfinConfigQuery = useJellyfinConfigQuery();

  const destinations = visibleDestinations({
    audiobookshelfConfigured,
    ...lookup,
    ...providerLookup,
    jellyfinConfigured: jellyfinConfigQuery.data?.configured ?? false,
  });
  const navItems: NavigationItem[] = destinations.map((d) => ({
    key: d.key,
    label: d.label,
    icon: <Icon name={DESTINATION_ICONS[d.key]} />,
  }));

  // `/library/$libraryId` still works (docs/ROADMAP.md §12a keeps every old
  // deep link alive) but Books/Podcasts nav items now point at the stable
  // `/books`/`/podcasts` paths instead, so a plain `startsWith` match against
  // `d.to` no longer finds either of them there. Resolve which nav item a
  // `/library/:id` URL belongs to from the id's actual `mediaType`, the same
  // lookup `BooksPage`/`PodcastsPage` themselves use to pick that id in the
  // first place.
  const libraryRouteMatch = /^\/library\/([^/]+)/.exec(location.pathname);
  const libraryRouteMediaType = libraryRouteMatch
    ? librariesQuery.data?.libraries.find((l) => l.id === libraryRouteMatch[1])?.mediaType
    : undefined;
  const libraryRouteKey: DestinationKey | undefined =
    libraryRouteMediaType === 'book'
      ? 'books'
      : libraryRouteMediaType === 'podcast'
        ? 'podcasts'
        : undefined;

  const activeDestination =
    destinations.find((d) => d.to === location.pathname) ??
    (libraryRouteKey && destinations.find((d) => d.key === libraryRouteKey)) ??
    destinations.filter((d) => d.to !== '/').find((d) => location.pathname.startsWith(d.to));
  const activeKey = activeDestination?.key ?? 'forYou';
  const isSettingsActive = location.pathname.startsWith('/settings');

  const handleActiveChange = (key: string) => {
    const destination = destinations.find((d) => d.key === key);
    if (destination) void navigate({ to: destination.to });
  };

  // The desktop rail's own destination list, without Search: Search is an
  // always-visible input at the top of the rail instead of a nav destination
  // there (Feishin's pattern), so it must not also appear as a duplicate link
  // below it. The compact bottom bar is unaffected — `navItems` (unfiltered)
  // still goes to `NavigationBar` below, where Search stays a normal tab.
  const railNavItems = navItems.filter((item) => item.key !== 'search');

  const handleRailSearchChange = (value: string) => {
    setSearchQuery(value);
    if (location.pathname !== '/search') {
      void navigate({ to: '/search' });
    }
  };

  return (
    <div
      className={`auralis-shell auralis-shell--${breakpoint}`}
      data-testid="shell"
      data-breakpoint={breakpoint}
      data-mini-player-active={miniPlayerActive}
      // The mini player's dock width (app.css, non-compact breakpoints) reads
      // this rather than hardcoding its own — see `shellLayout.ts`'s doc comment.
      // `--auralis-content-max-width` is read by `.auralis-page` in app.css, same
      // pattern — one function decides the number, the CSS variable carries it.
      style={
        {
          '--auralis-rail-width': `${railWidth(breakpoint)}px`,
          '--auralis-content-max-width': `${contentMaxWidth()}px`,
        } as CSSProperties
      }
    >
      {breakpoint === 'compact' ? (
        <>
          {/*
           * The compact bottom bar's five slots are already full with the
           * five primary destinations, so Settings gets its own small,
           * fixed, always-on-top affordance here instead (`app.css`'s
           * `.auralis-shell__settings-button` rule) — the mobile
           * counterpart to the rail footer link above.
           */}
          <div className="auralis-shell__settings-button">
            <IconButton
              aria-label="Settings"
              variant="standard"
              onClick={() => void navigate({ to: '/settings' })}
              data-testid="compact-settings-button"
            >
              <Icon name="settings" />
            </IconButton>
          </div>
          <main ref={contentRef} className="auralis-shell__content" data-testid="shell-content">
            {children}
          </main>
          <MiniPlayer onExpand={() => setNowPlayingOpen(true)} />
          <div data-testid="nav-bar">
            <NavigationBar
              items={navItems}
              activeKey={activeKey}
              onActiveChange={handleActiveChange}
            />
          </div>
        </>
      ) : (
        <div className="auralis-shell__row">
          <div
            data-testid={breakpoint === 'expanded' ? 'nav-rail-expanded' : 'nav-rail'}
            className="auralis-nav-rail-slot"
          >
            {/*
             * Mantine spike (docs/HANDOVER.md): the old `NavigationRail` is replaced
             * with `AppShell` + `AppShell.Navbar` + `NavLink`. `mode="static"` is
             * deliberate — Mantine's default `mode="fixed"` position:fixed's the
             * navbar to the viewport, which would fight this flex row and the
             * sibling `NowPlayingPanel`/`MiniPlayer` (one of which is itself
             * position:fixed at the compact breakpoint); `static` keeps AppShell a
             * normal-flow box that only sizes itself, leaving `.auralis-shell__row`
             * in charge of the actual page layout, unchanged.
             *
             * `component="button"` + explicit `aria-current` on MantineNavLink:
             * Mantine's default anchor rendering and `data-active` attribute would
             * both break `e2e/app/navigation.spec.ts`'s
             * `getByRole('button', { name: ... })` / `aria-current='page'`
             * assertions, which this file must keep passing unmodified.
             */}
            <MantineAppShell
              navbar={{ width: railWidth(breakpoint), breakpoint: 0 }}
              mode="static"
              padding={0}
              style={{ height: '100%' }}
            >
              <MantineAppShell.Navbar
                p="xs"
                style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
              >
                <div className="auralis-nav-rail-search" data-testid="nav-rail-search">
                  <SearchField
                    value={railSearchQuery}
                    onChange={handleRailSearchChange}
                    aria-label="Search"
                  />
                </div>
                {/*
                 * A dedicated wrapper, distinct from the Settings footer link
                 * below it — `e2e/app/navigation.spec.ts` scopes to this
                 * testid when it wants exactly the five primary destinations
                 * and nothing else that also happens to render as a `button`
                 * in this rail.
                 */}
                <div data-testid="nav-rail-destinations">
                  {railNavItems.map((item) => (
                    <MantineNavLink
                      key={item.key}
                      component="button"
                      type="button"
                      label={item.label}
                      leftSection={item.icon}
                      active={item.key === activeKey}
                      aria-current={item.key === activeKey ? 'page' : undefined}
                      onClick={() => handleActiveChange(item.key)}
                      style={RAIL_ACTIVE_LINK_STYLE}
                    />
                  ))}
                </div>
                {/*
                 * Settings is deliberately not one of the five primary
                 * destinations (docs/ROADMAP.md §12a), but it must stay
                 * reachable — parked in the rail's footer, below the real
                 * nav items (`marginTop: auto` on the flex column above), so
                 * it never competes with them for one of the five slots.
                 * There is no top app bar in this shell to put it in instead
                 * (`RootLayout.tsx` mounts none).
                 */}
                <div style={{ marginTop: 'auto' }}>
                  <MantineNavLink
                    component="button"
                    type="button"
                    label="Settings"
                    leftSection={<Icon name="settings" />}
                    active={isSettingsActive}
                    aria-current={isSettingsActive ? 'page' : undefined}
                    onClick={() => void navigate({ to: '/settings' })}
                    data-testid="nav-rail-settings"
                    style={RAIL_ACTIVE_LINK_STYLE}
                  />
                </div>
              </MantineAppShell.Navbar>
            </MantineAppShell>
          </div>
          <main ref={contentRef} className="auralis-shell__content" data-testid="shell-content">
            {children}
          </main>
          {breakpoint === 'expanded' ? <NowPlayingPanel /> : null}
        </div>
      )}
      {breakpoint !== 'compact' ? <MiniPlayer onExpand={() => setNowPlayingOpen(true)} /> : null}
      {breakpoint !== 'expanded' ? (
        <NowPlaying open={nowPlayingOpen} onClose={() => setNowPlayingOpen(false)} />
      ) : null}
      <ShortcutSheet />
    </div>
  );
}
