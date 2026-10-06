import React from 'react';
import { NS, REVEAL, activate, sx } from '../shared.js';

/*
 * Each density's padding and gap, on a phone and on desktop. `compact` is the queue's, `regular` a
 * track list's, `roomy` an episode list's (and a folded group's), `card` a filled settings row's.
 */
const DENSITY = {
  compact: { mobile: ['var(--spacing-sm)', 'var(--spacing-sm)', 'var(--spacing-md)'], desktop: ['var(--spacing-sm)', 'var(--spacing-sm)', 'var(--spacing-md)'] },
  regular: { mobile: ['var(--spacing-sm)', 'var(--spacing-xs)', 'var(--spacing-md)'], desktop: ['10px', 'var(--spacing-md)', 'var(--spacing-lg)'] },
  roomy: { mobile: ['10px', 'var(--spacing-xs)', 'var(--spacing-md)'], desktop: ['var(--spacing-md)', 'var(--spacing-md)', 'var(--spacing-lg)'] },
  card: { mobile: ['14px', 'var(--spacing-lg)', 'var(--spacing-lg)'], desktop: ['var(--spacing-md)', '14px', 'var(--spacing-lg)'] },
};

/** What the row sits on: nothing, the card fill, or the card tinted toward the accent when picked. */
const SURFACE = {
  none: 'transparent',
  card: 'var(--surface-card)',
  selected: 'color-mix(in oklab, var(--surface-card) 80%, var(--accent))',
};

/** The glyph over art of each size: a step up on the larger art. */
const ART_ICON = { lg: 'md' };

/**
 * The one row shell every list row draws: a press as a button's, the hairline divider inset to the
 * text column, and the leading, text and trailing slots, with the row's art and its overlay. With
 * neither `onClick` nor `disabled` it is a plain row holding its own controls.
 */
export function ListRow({
  children, leading, trailing, image, artSize, artGrey = false, artStatus, onArt, artLabel = 'Play', artIcon = 'play_arrow',
  onClick, disabled = false, divider = false, density = 'regular', surface = 'none', align = 'center', platform = 'desktop',
  expanded, draggable, onDragStart, onDragOver, onDrop, onDragEnd,
}) {
  const { CoverArt, StateLayer, Icon } = NS();
  const mobile = platform === 'mobile';
  const pressable = !!onClick || disabled;
  const off = disabled || !onClick;
  const [padY, padX, gap] = (DENSITY[density] || DENSITY.regular)[mobile ? 'mobile' : 'desktop'];
  // A filled row rounds a step more on a phone; a list row keeps the small corner of its art.
  const radius = mobile && (density === 'compact' || density === 'card') ? 'var(--radius-sm)' : 'var(--radius-xs)';
  const artRadius = mobile ? 'var(--radius-xs)' : 'var(--radius-2xs)';
  const fill = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:' + artRadius;
  // A press inside a control of the row, or inside what is marked as pressing on its own, stays
  // there: it never presses the row too.
  const own = (e) => { const inner = e.target && e.target.closest && e.target.closest('.sn-int,[data-sn-own-press]'); return !!inner && inner !== e.currentTarget; };
  const press = (e) => { if (!own(e)) onClick(e); };
  return (
    <div className={pressable ? 'sn-int' : undefined} role={pressable ? 'button' : undefined}
      tabIndex={pressable ? (off ? -1 : 0) : undefined} aria-disabled={pressable ? off : undefined} aria-expanded={expanded}
      onClick={off ? undefined : press} onKeyDown={off ? undefined : activate((e) => onClick(e))}
      draggable={draggable} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}
      style={sx('position:relative;box-sizing:border-box;width:100%;display:flex;align-items:' + (align === 'start' ? 'flex-start' : 'center')
        + ';gap:' + gap + ';padding:' + padY + ' ' + padX + ';border-radius:' + radius + ';background:' + (SURFACE[surface] || SURFACE.none)
        + ';transition:background var(--duration-quick) var(--ease-standard)' + (pressable ? ';cursor:pointer' : ''))}>
      {leading}
      {artSize && (
        <div className={REVEAL.host} data-always={mobile ? 'true' : 'false'}
          style={sx('position:relative;width:var(--art-' + artSize + ');height:var(--art-' + artSize + ');flex-shrink:0')}>
          <div style={sx('position:relative;overflow:hidden;width:100%;height:100%;border-radius:' + artRadius)}>
            {/* Greyed the way MediaCard greys an item you don't own: no colour, so a dark cover reads greyed too. */}
            {CoverArt && (artGrey
              ? <div style={sx('position:absolute;inset:0;filter:grayscale(1)')}><CoverArt src={image} /></div>
              : <CoverArt src={image} />)}
          </div>
          {/* No scrim without something to put on it: a bare dark square reads as a broken cover. */}
          {artStatus && <div style={sx(fill + ';background:var(--scrim)')}>{artStatus}</div>}
          {onArt && (
            <div className={REVEAL.item + ' sn-int'} role="button" tabIndex={0} aria-label={artLabel} title={artLabel}
              onClick={onArt} onKeyDown={activate(onArt)}
              style={sx(fill + ';cursor:pointer;z-index:var(--z-overlay);background:var(--scrim-strong)')}>
              <Icon name={artIcon} size={ART_ICON[artSize] || 'sm'} filled weight="strong" style={sx('color:var(--on-scrim)')} />
              {StateLayer && <StateLayer />}
            </div>
          )}
        </div>
      )}
      {/* The text column and what trails it, stretched to the row's height so the divider can sit
          along the row's bottom edge, inset to where the text starts. */}
      <div style={sx('position:relative;flex:1;min-width:0;align-self:stretch;display:flex;align-items:' + (align === 'start' ? 'flex-start' : 'center') + ';gap:' + gap)}>
        <div style={sx('flex:1;min-width:0;display:flex;flex-direction:column')}>{children}</div>
        {trailing}
        {divider && <div aria-hidden="true" style={sx('position:absolute;left:0;right:0;bottom:calc(-1 * ' + padY + ');height:var(--hairline);background:var(--surface-border)')} />}
      </div>
      {pressable && StateLayer && <StateLayer disabled={off} />}
    </div>
  );
}
