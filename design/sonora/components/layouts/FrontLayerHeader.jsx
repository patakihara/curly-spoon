import React from 'react';
import { clamp01, findPageScroller, injectCss, scrollMax, sx } from '../shared.js';

/* The spy title is two layers: the current one in flow, so the slot takes its width and can
   ellipsize, and the outgoing one absolute over it, so the swap cross-fades instead of the row
   jumping. Each layer's *base* state is its settled one — current visible, outgoing gone — so
   that killing the animation under prefers-reduced-motion leaves an instant swap rather than
   two titles stacked on top of one another. */
injectCss('sonora-frontlayerheader-css',
      '.sn-spy{position:relative;display:flex;align-items:center;flex:0 1 auto;min-width:0;overflow:hidden;'
    + 'margin-inline-end:var(--spacing-lg)}'
    + '.sn-spy-cur{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:1;'
    + 'animation:sn-spy-in var(--duration-fast) var(--ease-standard) both}'
    + '.sn-spy-prev{position:absolute;left:0;top:0;bottom:0;display:flex;align-items:center;'
    + 'white-space:nowrap;pointer-events:none;opacity:0;'
    + 'animation:sn-spy-out var(--duration-fast) var(--ease-standard) both}'
    + '@keyframes sn-spy-in{from{opacity:0;transform:translateY(var(--spacing-xs))}to{opacity:1;transform:translateY(0)}}'
    + '@keyframes sn-spy-out{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(calc(var(--spacing-xs) * -1))}}'
    + '.sn-spy-band{transition:opacity var(--duration-fast) var(--ease-standard),visibility var(--duration-fast) var(--ease-standard)}'
    + '@media (prefers-reduced-motion:reduce){.sn-spy-cur,.sn-spy-prev{animation:none}.sn-spy-band{transition:none}}');

const spyTitleOf = (s) => (typeof s === 'string' ? s : (s && s.title) || '');

/** The front layer's subheader: a fixed band at the same 1dp as the content below it, carrying tabs, a filter group or a scoped search field. Draws a scroll-linked hairline when its content is not a tab bar; when it is, the hairline is always shown (static, not scroll-linked) and the tabs sit flush to the bottom edge so their indicator lands right on it. With `spy` it needs no control at all — it reports the section title that has most recently scrolled up past it, and with nothing else in it, it shows only once one has: at rest there is no band. */
export function FrontLayerHeader({ children, tabs = false, progress = 0, platform = 'desktop', spy = false, sections, spyTitle, spySelector = '[data-spy-title],section', onSpyChange }) {
  const mobile = platform === 'mobile';
  /* The subheader shares the content's measure, so it takes the page margin rather than the app
     bar's inset — the tabs line up with the section headings underneath them. */
  const pad = 'var(--grid-margin' + (mobile ? '-mobile' : '') + ')';
  const show = clamp01(progress || 0);

  const root = React.useRef(null);
  // `spyTitle` is the controlled form — a card showing one state statically, or a page that
  // computes the title itself. It seeds the initial state so the first paint is already right
  // rather than animating in from blank.
  const [band, setBand] = React.useState(() => ({ cur: spyTitle === undefined ? '' : (spyTitle || ''), prev: null, n: 0 }));
  const last = React.useRef(band.cur);
  // Latest-value refs, so the scroll listener is never torn down and re-attached merely because
  // the caller passed a fresh array literal or closure this render.
  const sectionsRef = React.useRef(sections); sectionsRef.current = sections;
  const notify = React.useRef(onSpyChange); notify.current = onSpyChange;
  /* A spy band with nothing else in it shows only once a title has scrolled under it: at rest
     there is no band, not a blank one. So it lies over the top of the content instead of in flow,
     and arriving or leaving never moves the content. With a control in it, the band is always
     there, in flow, and the title leads it once one has passed. */
  const alone = spy && React.Children.count(children) === 0;
  const aloneRef = React.useRef(alone); aloneRef.current = alone;
  const apply = React.useCallback((next) => {
    const t = next || '';
    if (last.current === t) return;
    last.current = t;
    setBand((s) => ({ cur: t, prev: s.cur || null, n: s.n + 1 }));
    if (notify.current) notify.current(t);
  }, []);
  React.useEffect(() => { if (spyTitle !== undefined) apply(spyTitle); }, [spyTitle, apply]);

  const sectionsKey = Array.isArray(sections) ? sections.map(spyTitleOf).join('\u0000') : '';
  React.useEffect(() => {
    // Controlled, or switched off: never touch the DOM.
    if (!spy || spyTitle !== undefined) return undefined;
    const host = root.current && root.current.parentElement;
    if (!host) return undefined;
    /* Which title has "passed" is measured against the underside of this band — the line the
       behaviour is described against. In flow that is the top edge of the scrolling area; laid
       over the content, it is the band's own bottom edge, which it keeps while hidden. A band
       laid over the content stays away until the content has actually scrolled under its top
       edge: at rest the first section may already reach up behind where the band would be. */
    const read = (scroller) => {
      if (!scroller || !root.current) return null;
      const nodes = scroller.querySelectorAll(spySelector);
      if (!nodes.length) return null;
      if (aloneRef.current && nodes[0].getBoundingClientRect().top >= scroller.getBoundingClientRect().top) return '';
      const list = sectionsRef.current;
      // Positional titles only line up when the caller's list matches what the container holds.
      // A mismatch would label every section with its neighbour's name, which is worse than
      // saying nothing — so the list is used only on an exact count match, and a `data-spy-title`
      // on the element itself always wins over it.
      const positional = Array.isArray(list) && list.length === nodes.length;
      const line = root.current.getBoundingClientRect().bottom;
      let title = '';
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        // Strictly above the line, not level with it: at rest the first section still starts
        // below the band, so nothing has passed and there is no title.
        if (el.getBoundingClientRect().top - line >= 0) break;
        const attr = el.getAttribute('data-spy-title');
        const t = attr != null ? attr : (positional ? spyTitleOf(list[i]) : '');
        if (t) title = t;
      }
      return title;
    };
    // Only a scroller outside this header that holds sections.
    const find = () => findPageScroller(host, (n) => !(root.current && root.current.contains(n)) && n.querySelector(spySelector));
    // Capture, because scroll does not bubble — the same trick FrontLayer uses to watch a
    // scroller it does not own. Horizontal shelves are filtered out, or a sideways swipe through
    // a Shelf would blank the title.
    const onScroll = (e) => {
      const el = e.target;
      if (!el || scrollMax(el, 'y') <= 1) return;
      const t = read(el);
      if (t !== null) apply(t);
    };
    host.addEventListener('scroll', onScroll, true);
    // First read on the next frame: at mount nothing has been laid out yet, so every section
    // measures at 0 and would count as already passed.
    const id = requestAnimationFrame(() => { const t = read(find()); if (t !== null) apply(t); });
    return () => { host.removeEventListener('scroll', onScroll, true); cancelAnimationFrame(id); };
  }, [spy, spyTitle, spySelector, sectionsKey, apply]);

  /* Deliberately no aria-live: the title restates a heading that is already in the content, and
     announcing it on every scroll would be noise. */
  const spyRow = spy ? (
    <div className="sn-spy" style={sx('min-height:calc(var(--text-lg) * 1.5);font-family:var(--font-body);font-size:var(--text-md);font-weight:var(--weight-medium);line-height:1.4;color:var(--surface-fg)')}>
      {band.prev && (
        <span key={'p' + band.n} aria-hidden="true" className="sn-spy-prev"
          onAnimationEnd={() => setBand((s) => (s.prev ? { cur: s.cur, prev: null, n: s.n } : s))}>{band.prev}</span>
      )}
      <span key={'c' + band.n} className="sn-spy-cur">{band.cur}</span>
    </div>
  ) : null;

  const place = alone
    ? 'position:absolute;top:0;left:0;right:0;z-index:2;' +
      (band.cur ? 'opacity:1;visibility:visible' : 'opacity:0;visibility:hidden;pointer-events:none')
    : 'position:relative';
  return (
    <div ref={root} className={alone ? 'sn-spy-band' : undefined} style={sx(place + ';flex-shrink:0;display:flex;align-items:center;box-sizing:border-box;width:100%;background:var(--surface-bg);min-height:var(--appbar-controls-height);padding:0 ' + pad)}>
      {spyRow}
      {/* Tabs sit flush to the bottom edge, not centered in the band, so the tab bar's own
          underline indicator lands right on the hairline instead of floating above it. */}
      <div style={sx('flex:1;min-width:0;max-width:100%' + (tabs ? ';align-self:flex-end' : ''))}>{children}</div>
      {/* Inset to the content measure, not full-bleed: a rule that runs gutter to gutter cuts the
          front layer in half instead of reading as the top of the content column. A tab bar's own
          indicator still needs a rule to land on, so tabs get a static hairline rather than none. */}
      <span aria-hidden="true" style={sx(
        'position:absolute;bottom:0;height:1px;z-index:1;pointer-events:none;background:var(--divider);' +
        'left:' + pad + ';right:' + pad + ';' +
        'opacity:' + (tabs ? '1' : show.toFixed(2)) + ';' +
        (tabs ? '' : 'transition:opacity var(--duration-instant) linear')
      )} />
    </div>
  );
}
