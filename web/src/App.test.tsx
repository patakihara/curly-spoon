import { renderToString } from 'react-dom/server';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { routes } from './generated/nav/routes';

const at = (path: string) =>
  renderToString(<App router={createMemoryRouter(routes, { initialEntries: [path] })} />);

describe('App', () => {
  it('routes / to the Browse page', () => {
    expect(at('/')).toContain('Jump back in');
  });

  it('routes /settings to the Settings page', () => {
    expect(at('/settings')).toContain('Settings');
  });
});
