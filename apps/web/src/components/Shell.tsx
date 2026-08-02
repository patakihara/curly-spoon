/**
 * The adaptive shell (docs/DESIGN.md § Layout): bottom bar under 600px, a
 * collapsed rail from 600–1240px, an expanded rail with a persistent Now
 * Playing region above that — all driven by the one `useBreakpoint` hook, never
 * a component-local media query.
 */
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { Icon, NavigationBar, NavigationRail, type IconName, type NavigationItem } from '@auralis/ui';
import { useBreakpoint } from '../hooks/useBreakpoint.js';
import { useLibrariesQuery, useSetupQuery } from '../api/queries.js';
import { lookupLibraries, visibleDestinations, type DestinationKey } from './destinations.js';
import { NowPlayingPanel } from './NowPlayingPanel.js';
import { ShortcutSheet } from './ShortcutSheet.js';

const DESTINATION_ICONS: Record<DestinationKey, IconName> = {
  home: 'home',
  books: 'library_books',
  podcasts: 'podcasts',
  music: 'music_note',
  search: 'search',
  settings: 'settings',
};

export function Shell({ children }: { children: ReactNode }) {
  const breakpoint = useBreakpoint();
  const location = useLocation();
  const navigate = useNavigate();

  const setupQuery = useSetupQuery();
  const audiobookshelfConfigured = setupQuery.data?.configured ?? false;
  const librariesQuery = useLibrariesQuery(audiobookshelfConfigured);
  const lookup = lookupLibraries(librariesQuery.data?.libraries ?? []);

  const destinations = visibleDestinations({ audiobookshelfConfigured, ...lookup });
  const navItems: NavigationItem[] = destinations.map((d) => ({
    key: d.key,
    label: d.label,
    icon: <Icon name={DESTINATION_ICONS[d.key]} />,
  }));

  const activeDestination =
    destinations.find((d) => d.to === location.pathname) ??
    destinations
      .filter((d) => d.to !== '/')
      .find((d) => location.pathname.startsWith(d.to));
  const activeKey = activeDestination?.key ?? 'home';

  const handleActiveChange = (key: string) => {
    const destination = destinations.find((d) => d.key === key);
    if (destination) void navigate({ to: destination.to });
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
          <div data-testid="nav-bar">
            <NavigationBar items={navItems} activeKey={activeKey} onActiveChange={handleActiveChange} />
          </div>
        </>
      ) : (
        <div className="auralis-shell__row">
          <div data-testid={breakpoint === 'expanded' ? 'nav-rail-expanded' : 'nav-rail'}>
            <NavigationRail
              items={navItems}
              activeKey={activeKey}
              onActiveChange={handleActiveChange}
              expanded={breakpoint === 'expanded'}
            />
          </div>
          <main className="auralis-shell__content" data-testid="shell-content">
            {children}
          </main>
          {breakpoint === 'expanded' ? <NowPlayingPanel /> : null}
        </div>
      )}
      <ShortcutSheet />
    </div>
  );
}
