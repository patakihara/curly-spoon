import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from './generated/nav/routes';
import { signInData, withSignInData } from './sign-in';

const NOT_HOUSEHOLD = /one of the household/;

/** The app at `url`, rendered as the router would draw it there. */
function renderAt(url: string) {
  const router = createMemoryRouter(withSignInData(routes), { initialEntries: [url] });
  return renderToString(createElement(RouterProvider, { router }));
}

describe('[M0.sso/d] the sign-in page’s data', () => {
  it('holds no error on a first visit', () => {
    expect(signInData(new URLSearchParams(''))).toEqual({ errors: [] });
    expect(signInData(new URLSearchParams('return_to=%2Fbooks'))).toEqual({ errors: [] });
  });

  it('says why, for someone outside the household, as the canvas draws it', () => {
    const { errors } = signInData(new URLSearchParams('error=not_household'));
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(NOT_HOUSEHOLD);
  });

  it('says signing in did not finish, for any other refusal', () => {
    for (const code of ['sign_on_refused', 'bad_token', 'sign_on_unavailable', 'anything']) {
      const { errors } = signInData(new URLSearchParams(`error=${code}`));
      expect(errors, code).toHaveLength(1);
      expect(errors[0]!.message, code).not.toMatch(NOT_HOUSEHOLD);
      expect(errors[0]!.message.length, code).toBeGreaterThan(0);
    }
  });

  it('draws the banner at /sign-in only when the address carries a refusal', () => {
    expect(renderAt('/sign-in')).not.toMatch(NOT_HOUSEHOLD);
    expect(renderAt('/sign-in?return_to=%2Fbooks')).toContain(
      'Sign in with your household account',
    );
    expect(renderAt('/sign-in?error=not_household')).toMatch(NOT_HOUSEHOLD);
  });

  it('leaves every other route as generated', () => {
    const given = withSignInData(routes);
    expect(given.map((r) => r.path)).toEqual(routes.map((r) => r.path));
    for (const [i, route] of routes.entries()) {
      if (route.id !== 'signIn') expect(given[i]).toBe(route);
    }
  });
});
