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

/** Seconds as `m:ss`. */
export const formatTime = (t) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');

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
    if (isScrollerY(n) && n.scrollHeight > n.clientHeight + 1 && accept(n)) found = n;
  }
  return found;
};
