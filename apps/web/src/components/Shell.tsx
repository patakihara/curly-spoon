/**
 * The adaptive shell (docs/DESIGN.md § Layout): bottom bar under 600px, a
 * collapsed rail from 600–1240px, an expanded rail with a persistent Now
 * Playing region above that — all driven by the one `useBreakpoint` hook, never
 * a component-local media query.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
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
import { railWidth } from './shellLayout.js';
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

export function Shell({ children }: { children: ReactNode }) {
  const breakpoint = useBreakpoint();
  const location = useLocation();
  const navigate = useNavigate();
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
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
      style={{ '--auralis-rail-width': `${railWidth(breakpoint)}px` } as CSSProperties}
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
          <main className="auralis-shell__content" data-testid="shell-content">
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
                  />
                </div>
              </MantineAppShell.Navbar>
            </MantineAppShell>
          </div>
          <main className="auralis-shell__content" data-testid="shell-content">
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
