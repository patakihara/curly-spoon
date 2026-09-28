import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BackLayer, BackdropShell } from './generated/ui/index.js';

const shell = (props: Partial<Parameters<typeof BackdropShell>[0]>) =>
  renderToString(
    createElement(BackdropShell, {
      back: createElement(BackLayer, { title: 'Sign in' }),
      children: createElement('p', null, 'Sign in with your household account'),
      ...props,
    }),
  );

const column = /max-width:calc\(var\(--grid-max-width-form\) \+ 2 \* var\(--grid-margin\)\)/g;

describe("Sonora's BackdropShell in one centred column", () => {
  it('[M0.canvas] centres the heading and the content in one column of the reading width', () => {
    const html = shell({ column: 'form' });
    expect(html.match(column)).toHaveLength(2);
    expect(html).toMatch(/margin:0 auto;max-width:calc/);
    expect(html.indexOf('Sign in with your household account')).toBeGreaterThan(
      html.lastIndexOf('max-width:calc'),
    );
  });

  it('[M0.canvas] starts the heading at the page margin, where the content starts', () => {
    expect(shell({ column: 'form' })).toMatch(/padding:0 var\(--grid-margin\);height/);
    expect(
      shell({
        column: 'form',
        platform: 'mobile',
        back: createElement(BackLayer, { title: 'Sign in', platform: 'mobile' }),
      }),
    ).toMatch(/padding:0 var\(--grid-margin-mobile\);height/);
  });

  it('[M0.canvas] leaves a page in the shell as it was without a column', () => {
    const html = shell({});
    expect(html).not.toMatch(column);
    expect(html).toMatch(/padding:0 var\(--spacing-xl\);height/);
  });
});
