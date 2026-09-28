import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MediaHeader } from './generated/ui/index.js';

const header = (props: Parameters<typeof MediaHeader>[0]) =>
  renderToString(createElement(MediaHeader, { platform: 'desktop', ...props }));
const person = {
  round: true,
  kindLabel: 'Artist',
  meta: '9 releases',
  playLabel: null,
  nextLabel: null,
  lastLabel: null,
};

describe("Sonora's MediaHeader beside its art", () => {
  it("[M0.canvas] centres a person's caption on the round art, with no title and no action row", () => {
    const html = header(person);
    expect(html).toMatch(/^<div style="display:flex;gap:var\(--spacing-2xl\);align-items:center"/);
    expect(html).toContain('font-size:var(--text-lg);color:var(--surface-fg)">9 releases');
  });

  it("[M0.canvas] keeps an item with a title or buttons on the art's baseline, its meta small", () => {
    for (const html of [
      header({ ...person, title: 'Deep Inertia' }),
      header({ ...person, playLabel: 'Play' }),
    ]) {
      expect(html).toMatch(
        /^<div style="display:flex;gap:var\(--spacing-2xl\);align-items:flex-end"/,
      );
      expect(html).toContain('font-size:var(--text-sm);color:var(--surface-fg-muted)">9 releases');
    }
  });

  it('[M0.canvas] draws no empty subtitle line when there is no subtitle', () => {
    expect(header(person).match(/<div/g)).toHaveLength(
      header({ ...person, subtitle: 'x' }).match(/<div/g)!.length - 1,
    );
  });
});
