import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));

if (typeof document !== 'undefined' && !document.getElementById('sonora-frontlayerheader-css')) {
  const el = document.createElement('style');
  el.id = 'sonora-frontlayerheader-css';
  /* The spy title is two layers: the current one in flow, so the slot takes its width and can
     ellipsize, and the outgoing one absolute over it, so the swap cross-fades instead of the row
     jumping. Each layer's *base* state is its settled one — current visible, outgoing gone — so
     that killing the animation under prefers-reduced-motion leaves an instant swap rather than
     two titles stacked on top of one another. */
  el.textContent =
      '.sn-spy{position:relative;display:flex;align-items:center;flex:0 1 auto;min-width:0;overflow:hidden;'
    + 'margin-inline-end:var(--spacing-lg)}'
    + '.sn-spy-cur{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:1;'
    + 'animation:sn-spy-in var(--duration-fast) var(--ease-standard) both}'
    + '.sn-spy-prev{position:absolute;left:0;top:0;bottom:0;display:flex;align-items:center;'
    + 'white-space:nowrap;pointer-events:none;opacity:0;'
    + 'animation:sn-spy-out var(--duration-fast) var(--ease-standard) both}'
    + '@keyframes sn-spy-in{from{opacity:0;transform:translateY(var(--spacing-xs))}to{opacity:1;transform:translateY(0)}}'
    + '@keyframes sn-spy-out{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(calc(var(--spacing-xs) * -1))}}'
    + '@media (prefers-reduced-motion:reduce){.sn-spy-cur,.sn-spy-prev{animation:none}}';
  document.head.appendChild(el);
}

const spyTitleOf = (s) => (typeof s === 'string' ? s : (s && s.title) || '');

/** The front layer's subheader: a fixed band at the same 1dp as the content below it, carrying tabs, a filter group or a scoped search field. Draws a scroll-linked hairline only when its content is not a tab bar. With `spy` it needs no control at all — it reports the section title that has most recently scrolled up past it, and is blank until the first one does. */
export function FrontLayerHeader({ children, tabs = false, progress = 0, platform = 'desktop', spy = false, sections, spyTitle, spySelector = '[data-spy-title],section', onSpyChange }) {
  const mobile = platform === 'mobile';
  /* The subheader shares the content's measure, so it takes the page margin rather than the app
     bar's inset — the tabs line up with the section headings underneath them. */
  const pad = 'var(--grid-margin' + (mobile ? '-mobile' : '') + ')';
  // A tab bar already draws an underline indicator; a hairline under it would be a second
  // horizontal rule saying the same thing.
  const show = tabs ? 0 : Math.min(1, Math.max(0, progress || 0));

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
    /* Which title has "passed" is measured against the top edge of the scrolling area, because
       that edge is the underside of this band — the line the behaviour is described against. */
    const read = (scroller) => {
      if (!scroller) return null;
      const nodes = scroller.querySelectorAll(spySelector);
      if (!nodes.length) return null;
      const list = sectionsRef.current;
      // Positional titles only line up when the caller's list matches what the container holds.
      // A mismatch would label every section with its neighbour's name, which is worse than
      // saying nothing — so the list is used only on an exact count match, and a `data-spy-title`
      // on the element itself always wins over it.
      const positional = Array.isArray(list) && list.length === nodes.length;
      const line = scroller.getBoundingClientRect().top;
      let title = '';
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        // Strictly above the line, not level with it: at rest the first section still starts
        // below the band, so nothing has passed and the row is blank. That is a state, not a
        // missing value.
        if (el.getBoundingClientRect().top - line >= 0) break;
        const attr = el.getAttribute('data-spy-title');
        const t = attr != null ? attr : (positional ? spyTitleOf(list[i]) : '');
        if (t) title = t;
      }
      return title;
    };
    // The scroller is looked up rather than held: with `scroll={false}` the content owns it and
    // it is a new element after every view change. Last match, not first, for the same reason
    // FrontLayer takes the last — an overlay's scroller is the one on screen — and only among
    // those that actually contain sections.
    const find = () => {
      const all = host.querySelectorAll('*');
      let found = null;
      for (let i = 0; i < all.length; i++) {
        const n = all[i];
        if (root.current && root.current.contains(n)) continue;
        const oy = getComputedStyle(n).overflowY;
        if ((oy !== 'auto' && oy !== 'scroll') || n.scrollHeight <= n.clientHeight + 1) continue;
        if (n.querySelector(spySelector)) found = n;
      }
      return found;
    };
    // Capture, because scroll does not bubble — the same trick FrontLayer uses to watch a
    // scroller it does not own. Horizontal shelves are filtered out, or a sideways swipe through
    // a Shelf would blank the title.
    const onScroll = (e) => {
      const el = e.target;
      if (!el || !el.scrollHeight || el.scrollHeight <= el.clientHeight + 1) return;
      const t = read(el);
      if (t !== null) apply(t);
    };
    host.addEventListener('scroll', onScroll, true);
    // First read on the next frame: at mount nothing has been laid out yet, so every section
    // measures at 0 and would count as already passed.
    const id = requestAnimationFrame(() => { const t = read(find()); if (t !== null) apply(t); });
    return () => { host.removeEventListener('scroll', onScroll, true); cancelAnimationFrame(id); };
  }, [spy, spyTitle, spySelector, sectionsKey, apply]);

  /* The row reserves its height whether or not it holds a title, so the first title to arrive
     does not push the content down. Deliberately no aria-live: the title restates a heading that
     is already in the content, and announcing it on every scroll would be noise. */
  const spyRow = spy ? (
    <div className="sn-spy" style={sx('min-height:calc(var(--text-lg) * 1.5);font-family:var(--font-body);font-size:var(--text-lg);font-weight:var(--weight-strong);line-height:1.4;color:var(--surface-fg)')}>
      {band.prev && (
        <span key={'p' + band.n} aria-hidden="true" className="sn-spy-prev"
          onAnimationEnd={() => setBand((s) => (s.prev ? { cur: s.cur, prev: null, n: s.n } : s))}>{band.prev}</span>
      )}
      <span key={'c' + band.n} className="sn-spy-cur">{band.cur}</span>
    </div>
  ) : null;

  return (
    <div ref={root} style={sx('position:relative;flex-shrink:0;display:flex;align-items:center;box-sizing:border-box;width:100%;background:var(--surface-bg);min-height:var(--appbar-controls-height);padding:0 ' + pad)}>
      {spyRow}
      <div style={sx('flex:1;min-width:0;max-width:100%')}>{children}</div>
      {/* Inset to the content measure, not full-bleed: a rule that runs gutter to gutter cuts the
          front layer in half instead of reading as the top of the content column. */}
      {!tabs && (
        <span aria-hidden="true" style={sx(
          'position:absolute;bottom:0;height:1px;z-index:1;pointer-events:none;background:var(--surface-border);' +
          'left:' + pad + ';right:' + pad + ';' +
          'opacity:' + show.toFixed(2) + ';transition:opacity var(--duration-instant) linear'
        )} />
      )}
    </div>
  );
}
