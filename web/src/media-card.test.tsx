import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import * as Author from './generated/pages/Author';
import { MediaCard } from './generated/ui/index.js';
import { type Request, RequestContext } from './request';

const card = (props: Partial<Parameters<typeof MediaCard>[0]>) =>
  renderToString(
    createElement(MediaCard, { title: 'A Grain of Salt', image: '/art/x.jpg', ...props }),
  );
const noop = () => {};

describe("Sonora's MediaCard for an item you don't own", () => {
  it('[M0.canvas] greys its art to no colour and mutes its title, whether absent or a request', () => {
    for (const html of [card({ absent: true }), card({ status: 'Downloading · 30%' })]) {
      expect(html).toContain('filter:grayscale(1)');
      expect(html).toMatch(/color:var\(--surface-fg-muted\)">A Grain of Salt</);
    }
    expect(card({})).not.toContain('grayscale');
  });

  it('[M3.requests/c] keeps its status pill out of a greyed card’s disabled ink', () => {
    expect(card({ status: 'Failed', tone: 'error' })).toMatch(
      /data-sn-ink="true"[^>]*title="Failed"/,
    );
    const css = readFileSync(
      fileURLToPath(new URL('./generated/ui/basic/StateLayer.jsx', import.meta.url)),
      'utf8',
    );
    expect(css).toContain("' :not(' + LIVE + ',' + LIVE + ' *,' + INK + ',' + INK + ' *)");
  });

  it('[M0.canvas] offers its page as Open in a corner menu once a tap requests it instead', () => {
    expect(card({ absent: true, onRequest: noop, onClick: noop })).toContain(
      'aria-label="More options"',
    );
    expect(card({ absent: false, onRequest: noop, onClick: noop })).not.toContain('More options');
    expect(
      card({ absent: true, status: 'Requested', onRequest: noop, onClick: noop }),
    ).not.toContain('More options');
  });
});

describe('[M3.books] a card’s Request on a generated page', () => {
  const drawn = (ref: string, absent: boolean, request: Request | null) => {
    const row = { ...Author.frame.placeholder.books[0]!, ref, absent };
    const data = { ...Author.frame.placeholder, books: [row] };
    return renderToString(
      createElement(
        MemoryRouter,
        null,
        createElement(
          RequestContext.Provider,
          { value: request },
          createElement(Author.default, { data }),
        ),
      ),
    );
  };
  const asked = vi.fn();
  const handing: Request = (ref) => (ref === 'wanted' ? () => asked(ref) : undefined);

  // A card its Request binds keeps its page behind "More options", and taps to ask.
  it('binds an absent card to the request its ref names, once a page hands down its requests', () => {
    expect(drawn('wanted', true, handing)).toContain('More options');
  });

  it('draws an absent card with no Request when nothing takes it, as a ref that is no request', () => {
    expect(drawn('abs:item', true, handing)).not.toContain('More options');
    expect(drawn('wanted', true, null)).not.toContain('More options');
  });

  it('asks for nothing on a card you have', () => {
    expect(drawn('wanted', false, handing)).not.toContain('More options');
  });
});
