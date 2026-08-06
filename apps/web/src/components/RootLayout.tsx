/**
 * The root route component: the one place that mounts `ThemeProvider`, the
 * onboarding gate and the keyboard shortcut listener, and decides whether the
 * adaptive shell chrome (nav + Now Playing region) or a bare full-bleed layout
 * (onboarding) wraps the current route's content.
 *
 * `Shell` is loaded with `lazy()` rather than a static import (phase 10, entry-chunk
 * splitting — docs/ROADMAP.md §10). It pulls in the whole authenticated app chrome —
 * navigation, the mini player, the full Now Playing sheet, chapters, lyrics, sleep
 * timer — none of which an unconfigured server's onboarding flow (`bare === true`)
 * ever renders, and none of which a fresh boot needs before first paint either way.
 * `AuthGate` below already renders a loading spinner (`boot-loading`) for every page
 * load while `setupQuery` is in flight, so the app already has a natural, existing
 * async gap before `children` (and so `Shell`) is ever reached — `Shell`'s own chunk
 * is kicked off speculatively the moment this component mounts (the bare
 * `import()` below, its resolution intentionally unawaited) so it downloads in
 * parallel with that same network round trip instead of only starting once the
 * gate opens. In the common case the chunk is already cached by the time `Shell`
 * actually renders, so the `Suspense` boundary below is a correctness backstop
 * (a slow/offline load) rather than something a user normally sees.
 */
import { lazy, Suspense, useEffect } from 'react';
import { Outlet, useLocation } from '@tanstack/react-router';
import { CircularProgress, ThemeProvider } from '@auralis/ui';
import { useThemeStore } from '../state/themeStore.js';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts.js';
import { AuthGate } from './AuthGate.js';
import { UpdateBanner } from './UpdateBanner.js';

const Shell = lazy(() => import('./Shell.js').then((m) => ({ default: m.Shell })));

function isBareLayoutPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === '/setup' ||
    pathname.startsWith('/setup/')
  );
}

/** Same markup as `AuthGate`'s own `boot-loading` state, so a slow `Shell` chunk load
 *  reads as a continuation of the boot spinner already on screen rather than a new,
 *  distinct loading state. */
function ShellLoading() {
  return (
    <div className="auralis-boot-loading" data-testid="boot-loading">
      <CircularProgress indeterminate aria-label="Loading Auralis" />
    </div>
  );
}

export function RootLayout() {
  const mode = useThemeStore((s) => s.mode);
  const sourceColor = useThemeStore((s) => s.sourceColor);
  const location = useLocation();
  useKeyboardShortcuts();

  const bare = isBareLayoutPath(location.pathname);

  // Speculative prefetch: start downloading Shell's chunk as soon as the root
  // route mounts, regardless of `bare` — a bare (onboarding) visit today is
  // usually followed by a real, chrome-having one once setup completes, and
  // starting the fetch here overlaps it with AuthGate's own setup-query round
  // trip instead of waiting for that to finish first.
  //
  // The rejection is swallowed deliberately, and `void` alone would not have done
  // it: `void` discards the value, not the rejection, so a failed chunk fetch would
  // surface as an unhandled rejection. That is a real case rather than a defensive
  // one — this is a PWA, so a client on a stale service worker after a redeploy asks
  // for a content-hashed filename that no longer exists. Failing here costs nothing:
  // the `lazy()` import below is what the render path actually depends on, and it
  // reports its own failure to the root route's error boundary. A warm-up that could
  // not warm is not an error to tell anyone about.
  useEffect(() => {
    import('./Shell.js').catch(() => {});
  }, []);

  return (
    <ThemeProvider mode={mode} sourceColor={sourceColor}>
      <UpdateBanner />
      <AuthGate>
        {bare ? (
          <div className="auralis-bare-shell" data-testid="bare-shell">
            <Outlet />
          </div>
        ) : (
          <Suspense fallback={<ShellLoading />}>
            <Shell>
              <Outlet />
            </Shell>
          </Suspense>
        )}
      </AuthGate>
    </ThemeProvider>
  );
}
