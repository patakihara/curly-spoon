import React from 'react';

/**
 * A Material Symbols Rounded glyph, the one place Sonora sets the icon font. `size` picks a step of
 * the icon size ramp; `filled` turns the fill axis on; `weight` is the regular stroke, the
 * stronger one that filled and active glyphs take, or `text`, which sets no weight so the glyph
 * follows the font-weight of the text it sits in. The glyph is hidden from assistive technology:
 * the control or the text beside it carries the name. `style` adds colour or placement.
 */
export function Icon({ name, size = 'sm', filled = false, weight = 'body', style, className }) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        fontFamily: 'var(--font-icon)',
        fontSize: 'var(--icon-' + size + ')',
        lineHeight: 'var(--line-height-none)',
        fontVariationSettings:
          "'FILL' " + (filled ? 1 : 0) +
          (weight === 'text' ? '' : ",'wght' var(--weight-" + (weight === 'strong' ? 'body' : 'regular') + ')'),
        ...style,
      }}
    >
      {name}
    </span>
  );
}
