import React from 'react';

/*
 * The helpers every Sonora component shares, defined here once. A component imports what it needs
 * from it, as `../shared.js`. The web generator copies this module beside the components, and the
 * artifact bundle inlines it once ahead of them.
 */

/** A CSS declaration string as a React style object: `sx('min-width:0;--x:1')`. */
export const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));

/** Sonora's namespace, where a component looks up its siblings at render time: `NS().CoverArt`. */
export const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/** Enter or Space: the keys that press a button. */
export const isActivationKey = (e) => e.key === 'Enter' || e.key === ' ';

/**
 * A keydown handler that presses `fn` on Enter or Space, as a native button would, for an element
 * that is not one. Only a key pressed on the element itself counts, not one bubbling up from a
 * control inside it.
 */
export const activate = (fn) => (e) => {
  if (e.target !== e.currentTarget || !isActivationKey(e)) return;
  e.preventDefault();
  fn(e);
};

/**
 * The props that make an element that is not a `<button>` press as one: the button role, a place in
 * the focus order, the state layer's host class, a click, and Enter and Space through `activate`.
 * The handler gets the event, from a click or a key. Off (by default when there is no `fn`), it
 * stays a button but leaves the focus order, says it is disabled and presses nothing; on, it says
 * nothing of being disabled. Spread onto the element, which draws its own `<StateLayer />`.
 */
export const press = (fn, off = !fn) => ({
  className: 'sn-int',
  role: 'button',
  tabIndex: off ? -1 : 0,
  ...(off ? { 'aria-disabled': true } : {}),
  onClick: off ? undefined : fn,
  onKeyDown: off ? undefined : activate(fn),
});

/** Two digits, zero-padded: `7` as `07`. */
const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Seconds as `m:ss`, or `h:mm:ss` from an hour up. A time that is not a number yet, or is below
 * zero, reads `0:00`.
 */
export const formatTime = (t) => {
  const s = Number.isFinite(t) && t > 0 ? Math.floor(t) : 0;
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return (h ? h + ':' + pad2(m) : m) + ':' + pad2(s % 60);
};

/**
 * The Badge tone for a status's tone: a download in flight takes the accent, as the plan's
 * "Downloading" pill does, a request the warning tone, a failure the error tone.
 */
const BADGE_TONES = { library: 'accent', progress: 'accent', request: 'warning', error: 'error' };
export const badgeTone = (tone) => BADGE_TONES[tone] || 'accent';

/** Whether the viewer asked for reduced motion, so a scroll jumps rather than glides. */
export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A fraction held to 0..1. */
export const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** A fraction, held to 0..1, as a CSS percentage. */
export const percentOf = (v) => clamp01(v) * 100 + '%';

/**
 * A motion token's length in milliseconds, read where it applies: `900ms` and `.9s` (a minifier's
 * spelling of the same token) both give 900. Every Sonora timer reads its duration through this.
 */
export const tokenMs = (el, token) => {
  const m = /^\s*(-?(?:\d*\.)?\d+)(ms|s)\s*$/.exec(getComputedStyle(el).getPropertyValue(token));
  return m ? parseFloat(m[1]) * (m[2] === 's' ? 1000 : 1) : 0;
};

/** A length token's size in pixels, read where it applies. */
export const tokenPx = (el, token) => parseFloat(getComputedStyle(el).getPropertyValue(token)) || 0;

/**
 * Injects a component's own CSS once, under `id`. Only for what an inline style cannot say: a
 * pseudo-class, an ancestor's hover, a keyframe.
 */
export const injectCss = (id, css) => {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
};

/**
 * The hover reveal: an element with `REVEAL.item` stays hidden, and takes no pointer, until its
 * `REVEAL.host` ancestor is hovered or holds focus, or the host carries `data-always="true"` (a
 * touch surface, which has no hover). One rule, injected once, for every control shown that way.
 */
export const REVEAL = { host: 'sn-reveal-host', item: 'sn-reveal' };
injectCss('sonora-reveal-css', '.sn-reveal{opacity:0;pointer-events:none;transition:opacity var(--duration-quick) var(--ease-standard)}'
  + '.sn-reveal-host:hover .sn-reveal,.sn-reveal-host:focus-within .sn-reveal,.sn-reveal:focus-visible,.sn-reveal-host[data-always="true"] .sn-reveal{opacity:1;pointer-events:auto}');

/**
 * Calls `measure(el, entry)` whenever the element behind `ref` changes size, first when it is laid
 * out. `deps` restart the watch, as an effect's do.
 */
export const useMeasure = (ref, measure, deps) => {
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => measure(el, entry));
    ro.observe(el);
    return () => ro.disconnect();
  }, deps);
};

/** How far the element can scroll on `axis` ('x' or 'y'): its content's length past its own. */
export const scrollMax = (el, axis = 'y') =>
  axis === 'x' ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;

/**
 * Which edges of the element have content scrolled out of sight past them, on `axis`: not whether
 * it can scroll, but whether something is hidden in that direction right now. A pixel of slack
 * either way counts as none.
 */
export const scrollEdges = (el, axis = 'x') => {
  const max = scrollMax(el, axis);
  const pos = axis === 'x' ? el.scrollLeft : el.scrollTop;
  return max <= 1 ? { start: false, end: false } : { start: pos > 1, end: pos < max - 1 };
};

/** Whether the element scrolls on that axis. */
const scrolls = (overflow) => overflow === 'auto' || overflow === 'scroll';

/** Whether the element scrolls horizontally. */
export const isScrollerX = (el) => scrolls(getComputedStyle(el).overflowX);

/** Whether the element scrolls vertically. */
export const isScrollerY = (el) => scrolls(getComputedStyle(el).overflowY);

/** The nearest ancestor that scrolls vertically, so a list can follow along inside whatever pane holds it. */
export const nearestScroller = (el) => {
  for (let p = el && el.parentElement; p; p = p.parentElement) if (isScrollerY(p)) return p;
  return null;
};

/**
 * The page scroller inside `host`: the last descendant that scrolls vertically and has something
 * to scroll, and that `accept` takes. Last, not first: when a detail page floats over the view
 * beneath, the overlay's scroller is the one on screen. It is looked up, not held, because with
 * `scroll={false}` the content owns it and it is a new element after every view change.
 */
export const findPageScroller = (host, accept = () => true) => {
  if (!host) return null;
  const all = host.querySelectorAll('*');
  let found = null;
  for (let i = 0; i < all.length; i++) {
    const n = all[i];
    if (isScrollerY(n) && scrollMax(n, 'y') > 1 && accept(n)) found = n;
  }
  return found;
};

/**
 * The spoken transport's skip glyph: the interval as a number over a plain circular arrow, the
 * arrow alone mirrored for forward so the number stays legible. The icon font ships only fixed
 * 5, 10 and 30 second glyphs, and the interval is configurable. `Icon` is Sonora's Icon, passed in
 * by the caller; `size` is a step of its ramp, and the number is a third of that size.
 */
export const skipGlyph = (Icon, dir, seconds, size = 'sm') =>
  React.createElement('span', { style: sx('position:relative;display:inline-flex;align-items:center;justify-content:center') },
    React.createElement(Icon, { name: 'replay', size, style: sx('display:inline-block' + (dir === 'forward' ? ';transform:scaleX(-1)' : '')) }),
    React.createElement('span', {
      'aria-hidden': 'true',
      style: sx('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--font-body);font-weight:var(--weight-strong);font-size:calc(var(--icon-' + size + ') * .34)'),
    }, seconds));
