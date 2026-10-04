import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Icon, IconButton } from './generated/ui/index.js';

const icon = (props: Record<string, unknown>) =>
  renderToString(createElement(Icon, { name: 'play_arrow', ...props }));

describe("Sonora's Icon", () => {
  it('[M0.sonoraclean/d] draws its name as a glyph in the icon font, at the small icon size by default', () => {
    const html = icon({});
    expect(html).toContain('>play_arrow</span>');
    expect(html).toContain('font-family:var(--font-icon)');
    expect(html).toContain('font-size:var(--icon-sm)');
    expect(html).toContain('line-height:var(--line-height-none)');
    expect(html).toContain(
      'font-variation-settings:&#x27;FILL&#x27; 0,&#x27;wght&#x27; var(--weight-regular)',
    );
  });

  it.each(['2xs', 'xs', 'sm', 'md', 'lg', 'xl'])(
    '[M0.sonoraclean/d] size %s reads the matching icon size token',
    (size) => {
      expect(icon({ size })).toContain(`font-size:var(--icon-${size})`);
    },
  );

  it('[M0.sonoraclean/d] filled and strong turn on the fill axis and the stronger weight', () => {
    expect(icon({ filled: true, weight: 'strong' })).toContain(
      'font-variation-settings:&#x27;FILL&#x27; 1,&#x27;wght&#x27; var(--weight-body)',
    );
  });

  it("[M0.sonoraclean/d] weight text sets no weight axis, so the glyph follows the text's font-weight", () => {
    const html = icon({ filled: true, weight: 'text' });
    expect(html).toMatch(/font-variation-settings:&#x27;FILL&#x27; 1[;"]/);
    expect(html).not.toContain('wght');
  });

  it('[M0.sonoraclean/d] an IconButton given an icon name draws it through Icon', () => {
    const html = renderToString(createElement(IconButton, { icon: 'close', label: 'Close' }));
    expect(html).toContain('font-family:var(--font-icon)');
    expect(html).toContain('>close</span>');
  });
});
