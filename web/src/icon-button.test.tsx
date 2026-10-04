import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IconButton } from './generated/ui/index.js';

const button = (props: Record<string, unknown>) =>
  renderToString(createElement(IconButton, { icon: 'close', label: 'Close', ...props }));

/** The inline style of the button itself, the first element drawn. */
const style = (html: string) => /^<button[^>]*style="([^"]*)"/.exec(html)?.[1] ?? '';

describe("Sonora's IconButton", () => {
  it.each(['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'])(
    '[M0.sonoraclean/d] size %s is a circle the matching control size across',
    (size) => {
      const s = style(button({ size }));
      expect(s).toContain(`width:var(--control-${size})`);
      expect(s).toContain(`height:var(--control-${size})`);
      expect(s).toContain('border-radius:var(--radius-round)');
    },
  );

  it('[M0.sonoraclean/d] plain is the default: a transparent circle, the small control size, in surface ink', () => {
    const s = style(button({}));
    expect(s).toContain('width:var(--control-sm)');
    expect(s).toContain('background:transparent');
    expect(s).toContain('color:var(--surface-fg)');
    expect(s).not.toContain('border:var(--hairline)');
  });

  it('[M0.sonoraclean/d] outline rings the circle with a hairline in the border colour', () => {
    expect(style(button({ variant: 'outline' }))).toContain(
      'border:var(--hairline) solid var(--surface-border)',
    );
  });

  it('[M0.sonoraclean/d] raised sits on the card fill with a shadow, in surface ink', () => {
    const s = style(button({ variant: 'raised', size: 'md' }));
    expect(s).toContain('background:var(--surface-card)');
    expect(s).toContain('box-shadow:var(--shadow-md)');
    expect(s).toContain('color:var(--surface-fg)');
  });

  it('[M0.sonoraclean/d] scrim sits on the soft scrim in on-scrim ink, for a button over artwork', () => {
    const s = style(button({ variant: 'scrim', size: 'xs' }));
    expect(s).toContain('background:var(--scrim-soft)');
    expect(s).toContain('color:var(--on-scrim)');
  });

  it('[M0.sonoraclean/c] tonal is a squat pill on the card fill, wider than it is tall, with a smaller glyph', () => {
    const html = button({ variant: 'tonal' });
    const s = style(html);
    expect(s).toContain('height:var(--control-xs)');
    expect(s).toContain('width:calc(var(--control-xs) + var(--spacing-sm))');
    expect(s).toContain('border-radius:var(--radius-pill)');
    expect(s).toContain('background:var(--surface-card)');
    expect(html).toContain('font-size:var(--icon-xs)');
  });

  it('[M0.sonoraclean/c] tonal and active turns the glyph accent and filled', () => {
    const html = button({ variant: 'tonal', active: true });
    expect(style(html)).toContain('color:var(--accent-ink)');
    expect(html).toContain('&#x27;FILL&#x27; 1');
  });

  it('[M0.sonoraclean/c] a tonal glyph turns over when it changes; the other variants cut to the new one', () => {
    const html = button({ variant: 'tonal' });
    expect(html).toContain('animation:sn-glyph-in var(--duration-quick) var(--ease-standard) both');
    expect(button({})).not.toContain('sn-glyph-in');
  });

  it.each([
    ['plain', 'accent', 'var(--accent)'],
    ['plain', 'play', 'var(--play)'],
    ['outline', 'library', 'var(--tone-library)'],
  ])('[M0.sonoraclean/d] %s and active takes the %s colour', (variant, tone, ink) => {
    expect(style(button({ variant, tone, active: true }))).toContain(`color:${ink}`);
  });

  it('[M0.sonoraclean/d] tone inherit takes the ink of what it sits on, and muted the muted ink', () => {
    expect(style(button({ tone: 'inherit' }))).toContain('color:inherit');
    expect(style(button({ muted: true }))).toContain('color:var(--surface-fg-muted)');
  });

  it.each(['plain', 'outline', 'tonal', 'raised', 'scrim'])(
    '[M0.states/a] %s keeps its accessible name and draws its state layer',
    (variant) => {
      const html = button({ variant, onClick: () => {} });
      expect(html).toMatch(/^<button[^>]*aria-label="Close"/);
      expect(html).toContain('data-sn-state-layer');
    },
  );

  it('[M0.sonoraclean/d] passes on a tooltip, the pressed and expanded states and the element it controls', () => {
    const html = button({ title: 'Close', pressed: true, expanded: false, controls: 'panel' });
    expect(html).toMatch(/^<button[^>]*title="Close"/);
    expect(html).toMatch(/^<button[^>]*aria-pressed="true"/);
    expect(html).toMatch(/^<button[^>]*aria-expanded="false"/);
    expect(html).toMatch(/^<button[^>]*aria-controls="panel"/);
  });

  it('[M0.sonoraclean/d] takes a class and its placement from the caller, over its own look', () => {
    const html = button({ className: 'sn-reveal', style: { position: 'absolute', top: 0 } });
    expect(html).toMatch(/^<button[^>]*class="sn-int sn-reveal"/);
    expect(style(html)).toContain('position:absolute');
  });
});
