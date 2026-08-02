/**
 * The root route component: the one place that mounts `ThemeProvider`, the
 * onboarding gate and the keyboard shortcut listener, and decides whether the
 * adaptive shell chrome (nav + Now Playing region) or a bare full-bleed layout
 * (onboarding) wraps the current route's content.
 */
import { Outlet, useLocation } from '@tanstack/react-router';
import { ThemeProvider } from '@auralis/ui';
import { useThemeStore } from '../state/themeStore.js';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { AuthGate } from './AuthGate.js';
import { Shell } from './Shell.js';
import { UpdateBanner } from './UpdateBanner.js';

function isBareLayoutPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === '/setup' ||
    pathname.startsWith('/setup/')
  );
}

export function RootLayout() {
  const mode = useThemeStore((s) => s.mode);
  const sourceColor = useThemeStore((s) => s.sourceColor);
  const location = useLocation();
  useKeyboardShortcuts();

  const bare = isBareLayoutPath(location.pathname);

  return (
    <ThemeProvider mode={mode} sourceColor={sourceColor}>
      <UpdateBanner />
      <AuthGate>
        {bare ? (
          <div className="auralis-bare-shell" data-testid="bare-shell">
            <Outlet />
          </div>
        ) : (
          <Shell>
            <Outlet />
          </Shell>
        )}
      </AuthGate>
    </ThemeProvider>
  );
}
