/**
 * The adaptive shell (docs/DESIGN.md § Layout): bottom bar under 600px, a
 * collapsed rail from 600–1240px, an expanded rail with a persistent Now
 * Playing region above that — all driven by the one `useBreakpoint` hook, never
 * a component-local media query.
 */
import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import {
  Icon,
  MantineAppShell,
  MantineNavLink,
  NavigationBar,
  SearchField,
  type IconName,
  type NavigationItem,
} from '@auralis/ui';
import { useBreakpoint } from '../hooks/useBreakpoint.js';
import { useLibrariesQuery, useProvidersQuery, useSetupQuery } from '../api/queries.js';
import { MiniPlayer } from '../features/player/MiniPlayer.js';
import { NowPlaying } from '../features/player/NowPlaying.js';
import { useAudioElement } from '../features/player/useAudioElement.js';
import { useMediaSession } from '../features/player/useMediaSession.js';
import { useProgressSync } from '../features/player/useProgressSync.js';
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
  home: 'home',
  books: 'book_2',
  podcasts: 'podcasts',
  music: 'music_note',
  requests: 'queue',
  search: 'search',
  settings: 'settings',
};

export function Shell({ children }: { children: ReactNode }) {
  const breakpoint = useBreakpoint();
  const location = useLocation();
  const navigate = useNavigate();
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const railSearchQuery = useUiStore((s) => s.query);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);

  // The single shared `<audio>` element, the OS media-session integration and
  // progress sync — all three take no arguments and read the player store
  // directly, so they only ever need to be mounted once, here, where every
  // signed-in route lives underneath.
  useAudioElement();
  useMediaSession();
  useProgressSync();

  const setupQuery = useSetupQuery();
  const audiobookshelfConfigured = setupQuery.data?.configured ?? false;
  const librariesQuery = useLibrariesQuery(audiobookshelfConfigured);
  const lookup = lookupLibraries(librariesQuery.data?.libraries ?? []);
  const providersQuery = useProvidersQuery();
  const providerLookup = lookupProviders(providersQuery.data?.providers ?? []);

  const destinations = visibleDestinations({
    audiobookshelfConfigured,
    ...lookup,
    ...providerLookup,
  });
  const navItems: NavigationItem[] = destinations.map((d) => ({
    key: d.key,
    label: d.label,
    icon: <Icon name={DESTINATION_ICONS[d.key]} />,
  }));

  const activeDestination =
    destinations.find((d) => d.to === location.pathname) ??
    destinations.filter((d) => d.to !== '/').find((d) => location.pathname.startsWith(d.to));
  const activeKey = activeDestination?.key ?? 'home';

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
    >
      {breakpoint === 'compact' ? (
        <>
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
              navbar={{ width: breakpoint === 'expanded' ? 220 : 80, breakpoint: 0 }}
              mode="static"
              padding={0}
              style={{ height: '100%' }}
            >
              <MantineAppShell.Navbar p="xs" style={{ height: '100%' }}>
                <div className="auralis-nav-rail-search" data-testid="nav-rail-search">
                  <SearchField
                    value={railSearchQuery}
                    onChange={handleRailSearchChange}
                    aria-label="Search"
                  />
                </div>
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
