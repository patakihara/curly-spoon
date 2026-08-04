/**
 * The route tree, built by hand with `createRoute` (no file-based route
 * generation — `@tanstack/router-plugin` isn't among this phase's pre-installed
 * dependencies, and code-based routing is a fully-supported, documented mode of
 * `@tanstack/react-router`, not a workaround). Every leaf route is code-split via
 * `lazyRouteComponent`, so the initial bundle only pays for the shell + whichever
 * route the user landed on.
 */
import { createRoute, createRootRoute, lazyRouteComponent } from '@tanstack/react-router';
import { RootLayout } from '../components/RootLayout.js';
import { RouteErrorBoundary } from '../components/RouteErrorBoundary.js';
import { NotFoundPage } from '../components/NotFoundPage.js';

export const rootRoute = createRootRoute({
  component: RootLayout,
  errorComponent: RouteErrorBoundary,
  notFoundComponent: NotFoundPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: lazyRouteComponent(() => import('../features/home/HomePage.js'), 'HomePage'),
  errorComponent: RouteErrorBoundary,
});

const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/library/$libraryId',
  component: lazyRouteComponent(() => import('../features/library/LibraryPage.js'), 'LibraryPage'),
  errorComponent: RouteErrorBoundary,
});

const itemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/item/$itemId',
  component: lazyRouteComponent(() => import('../features/item/ItemPage.js'), 'ItemPage'),
  errorComponent: RouteErrorBoundary,
});

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/search',
  component: lazyRouteComponent(() => import('../features/search/SearchPage.js'), 'SearchPage'),
  errorComponent: RouteErrorBoundary,
});

const requestsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/requests',
  component: lazyRouteComponent(
    () => import('../features/requests/RequestsPage.js'),
    'RequestsPage',
  ),
  errorComponent: RouteErrorBoundary,
});

// A flat path rather than nested under `/library/$libraryId` — discovery isn't scoped
// to a library id the user might not have yet (`PodcastDiscoverPage` looks up the
// podcast library itself), and it's reached from a library page's "Add podcast" button,
// not by browsing into one.
const podcastDiscoverRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/podcasts/discover',
  component: lazyRouteComponent(
    () => import('../features/podcasts/PodcastDiscoverPage.js'),
    'PodcastDiscoverPage',
  ),
  errorComponent: RouteErrorBoundary,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: lazyRouteComponent(
    () => import('../features/settings/SettingsPage.js'),
    'SettingsPage',
  ),
  errorComponent: RouteErrorBoundary,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: lazyRouteComponent(() => import('../features/onboarding/SetupPage.js'), 'SetupPage'),
  errorComponent: RouteErrorBoundary,
});

// A flat sibling path rather than a nested child of `setupRoute` — this is step 3
// of onboarding (optional services), reached only by navigating here explicitly
// after login succeeds, never by a user typing a partial `/setup` URL.
const setupServicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup/services',
  component: lazyRouteComponent(
    () => import('../features/onboarding/ServicesPage.js'),
    'ServicesPage',
  ),
  errorComponent: RouteErrorBoundary,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: lazyRouteComponent(() => import('../features/onboarding/LoginPage.js'), 'LoginPage'),
  errorComponent: RouteErrorBoundary,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  libraryRoute,
  itemRoute,
  requestsRoute,
  podcastDiscoverRoute,
  searchRoute,
  settingsRoute,
  setupRoute,
  setupServicesRoute,
  loginRoute,
]);
