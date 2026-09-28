import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ResultRow } from './generated/ui/index.js';

const row = (props: Partial<Parameters<typeof ResultRow>[0]>) =>
  renderToString(
    createElement(ResultRow, {
      title: 'Salt and Static',
      meta: 'Album · Soul Vertex · ListenBrainz',
      ...props,
    }),
  );

describe("Sonora's ResultRow with a detail line", () => {
  const reason = 'Listeners of Deep Inertia play Soul Vertex most weeks.';

  it('[M0.canvas] says why the row is there on a line under the meta, wrapping to two lines', () => {
    const html = row({ detail: reason });
    expect(html.indexOf(reason)).toBeGreaterThan(html.indexOf('Album · Soul Vertex'));
    expect(html).toMatch(/-webkit-line-clamp:2[^"]*">Listeners of Deep Inertia/);
  });

  it('[M0.canvas] draws no detail line when the row has no reason', () => {
    expect(row({})).not.toContain('line-clamp');
  });
});
