import { type RouteObject, useSearchParams } from 'react-router';
import SignIn, { type SignInData } from './generated/pages/SignIn';

/**
 * The data behind the sign-in page. The server sends a signed-out visitor here with `return_to`,
 * where they were going, and a refused sign-in back here with `error`, the refusal's code. Only
 * a refusal gives the page an error to show; a first visit has none.
 */

/** What each refusal tells the person; any other code says only that signing in did not finish. */
const MESSAGES: Record<string, string> = {
  not_household:
    "That account isn't one of the household's, so Auralis can't let it in. Whoever runs the server can add it.",
  sign_on_refused: 'The household sign-in said no. Try again, or ask whoever runs the server.',
};
const DID_NOT_FINISH = "Signing in didn't finish. Try again.";

export function signInData(query: URLSearchParams): SignInData {
  const error = query.get('error');
  if (error === null) return { errors: [] };
  return { errors: [{ message: MESSAGES[error] ?? DID_NOT_FINISH }] };
}

function SignInScreen() {
  const [query] = useSearchParams();
  return <SignIn data={signInData(query)} />;
}

/** The generated routes, the sign-in page given its data from the address. */
export function withSignInData(routes: RouteObject[]): RouteObject[] {
  return routes.map((route) =>
    route.id === 'signIn' ? { ...route, element: <SignInScreen /> } : route,
  );
}
