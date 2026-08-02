import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.js';

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
});

// Registers this router's route types as the ambient `Register` interface, so
// `Link`, `useNavigate`, etc. are fully typed (`to` is checked against the tree)
// anywhere in the app without threading the router type through by hand.
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
