import type { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

type Router = ReturnType<typeof createBrowserRouter>;

/** The app's root: the route table generated from design/app/nav.json. */
export function App({ router }: { router: Router }) {
  return <RouterProvider router={router} />;
}
