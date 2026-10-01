import React from 'react';

const DISABLED = ':is(:disabled,[aria-disabled="true"],[data-disabled])';
const FORCED_OFF = '[data-sn-force="disabled"] .sn-int';
const LIVE = '.sn-int:not(' + DISABLED + ')';
const mix = (share) => 'color-mix(in srgb,var(--surface-fg) calc(var(' + share + ') * 100%),transparent)';

if (typeof document !== 'undefined' && !document.getElementById('sonora-statelayer-css')) {
  const el = document.createElement('style');
  el.id = 'sonora-statelayer-css';
  // The host keeps its own box; the layer lies over it, takes its corners, and clips its ripple.
  // The ring is the layer's outline, so it follows the corners and moves nothing.
  el.textContent = '.sn-int{position:relative;-webkit-tap-highlight-color:transparent}'
    + '.sn-int:focus,.sn-int:focus-visible{outline:none}'
    // A focused control lifts over its neighbours, so a segment's ring is not drawn under the next.
    + '.sn-int:focus-within{z-index:1}'
    + '[data-sn-state-layer]{position:absolute;inset:0;border-radius:inherit;overflow:hidden;pointer-events:none}'
    + '[data-sn-state-layer]::before{content:"";position:absolute;inset:0;background:currentColor;opacity:0;transition:opacity var(--duration-fast) var(--ease-standard)}'
    + '[data-sn-state-layer][data-hover]::before,[data-sn-force="hovered"] [data-sn-state-layer]::before{opacity:var(--state-layer-hover)}'
    + '[data-sn-state-layer][data-focus]::before,[data-sn-force="focused"] [data-sn-state-layer]::before{opacity:var(--state-layer-focus)}'
    + '[data-sn-state-layer][data-pressed]::before,[data-sn-force="pressed"] [data-sn-state-layer]::before{opacity:var(--state-layer-pressed)}'
    + '[data-sn-state-layer][data-focus],[data-sn-force="focused"] [data-sn-state-layer]{outline:var(--focus-ring-width) solid var(--focus-ring);outline-offset:var(--focus-ring-offset)}'
    + '[data-sn-ripple]{position:absolute;border-radius:50%;background:currentColor;opacity:var(--state-layer-pressed);transform:scale(0);'
    + 'animation:sn-ripple var(--duration-medium) var(--ease-standard) forwards;transition:opacity var(--duration-fast) var(--ease-standard)}'
    + '[data-sn-ripple][data-out]{opacity:0}'
    + '@keyframes sn-ripple{to{transform:scale(1)}}'
    // A preview's press: a ripple part-way through its growth from low on the left.
    + '[data-sn-force="pressed"] [data-sn-state-layer]:not([data-ripple="off"])::after{content:"";position:absolute;left:30%;top:70%;width:140%;aspect-ratio:1;'
    + 'border-radius:50%;transform:translate(-50%,-50%) scale(.5);background:currentColor;opacity:var(--state-layer-pressed)}'
    // Disabled: content at 38% of the surface ink; a filled control's container at 12%. Central, and
    // over the component's own inline colours.
    + '.sn-int' + DISABLED + ',' + FORCED_OFF + '{cursor:default!important;color:' + mix('--disabled-content') + '!important}'
    // A disabled card's ink stops at an enabled control inside it, which keeps its own.
    + '.sn-int' + DISABLED + ' :not(' + LIVE + ',' + LIVE + ' *),' + FORCED_OFF + ' *{color:inherit!important}'
    + '.sn-int.sn-filled' + DISABLED + ',' + FORCED_OFF + '.sn-filled{background:' + mix('--disabled-container') + '!important;border-color:transparent!important;box-shadow:none!important}'
    + FORCED_OFF + '{pointer-events:none}'
    + '.sn-int' + DISABLED + ' [data-sn-state-layer],' + FORCED_OFF + ' [data-sn-state-layer]{outline:none!important}'
    + '.sn-int' + DISABLED + ' [data-sn-state-layer]::before,' + FORCED_OFF + ' [data-sn-state-layer]::before{opacity:0!important}'
    + '@media (prefers-reduced-motion:reduce){[data-sn-ripple]{animation:none;transform:none}[data-sn-state-layer]::before{transition:none}}';
  document.head.appendChild(el);
}

/** A motion token's length in milliseconds, read where it applies. */
const duration = (el, token, fallback) => {
  const v = parseFloat(getComputedStyle(el).getPropertyValue(token));
  return Number.isFinite(v) ? v : fallback;
};

/**
 * Scrolls each scroller around `layer` the least it takes to show the whole focus ring. The
 * browser's own focus scroll leaves a control that is partly in view where it is, or brings it
 * just to the edge, where its scroller cuts the ring off. Only scrollers move; a box that merely
 * clips is never scrolled.
 */
const reveal = (layer) => {
  const css = getComputedStyle(layer);
  const reach = (parseFloat(css.getPropertyValue('--focus-ring-width')) || 3) + (parseFloat(css.getPropertyValue('--focus-ring-offset')) || 2);
  const r = layer.getBoundingClientRect();
  let left = r.left - reach, right = r.right + reach, top = r.top - reach, bottom = r.bottom + reach;
  // The least move that brings [lo, hi] inside [min, max]; its start first when it cannot fit.
  // Whole pixels, rounded outward, since a scroll offset may land on a whole pixel.
  const outward = (d) => Math.sign(d) * Math.ceil(Math.abs(d) - 0.01);
  const nearest = (lo, hi, min, max) => outward(lo < min ? lo - min : hi > max ? Math.min(hi - max, lo - min) : 0);
  for (let a = layer.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
    const s = getComputedStyle(a);
    const sx = /auto|scroll/.test(s.overflowX), sy = /auto|scroll/.test(s.overflowY);
    if (!sx && !sy) continue;
    const c = a.getBoundingClientRect();
    const x0 = c.left + a.clientLeft, y0 = c.top + a.clientTop;
    const clamp = (v, max) => Math.max(0, Math.min(max, v));
    const dx = sx ? clamp(a.scrollLeft + nearest(left, right, x0, x0 + a.clientWidth), a.scrollWidth - a.clientWidth) - a.scrollLeft : 0;
    const dy = sy ? clamp(a.scrollTop + nearest(top, bottom, y0, y0 + a.clientHeight), a.scrollHeight - a.clientHeight) - a.scrollTop : 0;
    if (dx === 0 && dy === 0) continue;
    a.scrollBy({ left: dx, top: dy });
    left -= dx; right -= dx; top -= dy; bottom -= dy;
  }
};

/**
 * Material's state layer: the hover, focus and press wash over a control, its focus ring, and the
 * ripple a press sends out from the pointer. The last child of the element that shows the state;
 * it reads the state from the nearest `.sn-int` host, never from a control nested inside it.
 */
export function StateLayer({ disabled = false, ripple = true }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const layer = ref.current;
    const host = layer && layer.parentElement ? layer.parentElement.closest('.sn-int') : null;
    if (!host || disabled) return undefined;
    const flag = (name, on) => (on ? layer.setAttribute('data-' + name, '') : layer.removeAttribute('data-' + name));
    const off = () => host.matches(DISABLED);
    // An event from a control nested in this host belongs to that control's own layer.
    const own = (e) => e.target instanceof Element && e.target.closest('.sn-int') === host;
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };

    const spawn = (clientX, clientY) => {
      if (!ripple) return;
      const r = layer.getBoundingClientRect();
      const x = clientX - r.left, y = clientY - r.top;
      const far = Math.max(Math.hypot(x, y), Math.hypot(r.width - x, y), Math.hypot(x, r.height - y), Math.hypot(r.width - x, r.height - y));
      const wave = document.createElement('span');
      wave.setAttribute('data-sn-ripple', '');
      wave.dataset.born = String(performance.now());
      wave.style.left = (x - far) + 'px';
      wave.style.top = (y - far) + 'px';
      wave.style.width = wave.style.height = (2 * far) + 'px';
      layer.appendChild(wave);
    };
    const release = () => {
      flag('pressed', false);
      const grow = duration(host, '--duration-medium', 280), fade = duration(host, '--duration-fast', 150);
      layer.querySelectorAll('[data-sn-ripple]:not([data-leaving])').forEach((wave) => {
        // A ripple finishes growing before it fades, so a quick tap still reads as one.
        const left = Math.max(0, grow - (performance.now() - Number(wave.dataset.born)));
        wave.setAttribute('data-leaving', '');
        later(() => { wave.setAttribute('data-out', ''); later(() => wave.remove(), fade + 30); }, left);
      });
    };

    const enter = (e) => { if (e.pointerType !== 'touch' && !off()) flag('hover', true); };
    const leave = () => { flag('hover', false); release(); };
    const down = (e) => {
      if (e.button !== 0 || off() || !own(e)) return;
      flag('pressed', true);
      spawn(e.clientX, e.clientY);
    };
    const focusIn = (e) => {
      if (off() || !own(e)) return;
      const visible = e.target.matches(':focus-visible');
      flag('focus', visible);
      if (visible) reveal(layer);
    };
    const focusOut = (e) => { if (!(e.relatedTarget instanceof Node && host.contains(e.relatedTarget))) flag('focus', false); };
    const typing = (e) => e.target instanceof Element && e.target.matches('input,textarea');
    const keyDown = (e) => {
      if (e.repeat || (e.key !== 'Enter' && e.key !== ' ') || off() || !own(e) || typing(e)) return;
      flag('pressed', true);
      const r = layer.getBoundingClientRect();
      spawn(r.left + r.width / 2, r.top + r.height / 2);
    };
    const keyUp = (e) => { if (e.key === 'Enter' || e.key === ' ') release(); };

    const on = [['pointerenter', enter], ['pointerleave', leave], ['pointerdown', down], ['pointerup', release],
      ['pointercancel', release], ['focusin', focusIn], ['focusout', focusOut], ['keydown', keyDown], ['keyup', keyUp]];
    on.forEach(([type, fn]) => host.addEventListener(type, fn));
    if (host.matches(':hover')) flag('hover', true);
    return () => {
      on.forEach(([type, fn]) => host.removeEventListener(type, fn));
      timers.forEach(clearTimeout);
      ['hover', 'focus', 'pressed'].forEach((name) => flag(name, false));
      layer.querySelectorAll('[data-sn-ripple]').forEach((wave) => wave.remove());
    };
  }, [disabled, ripple]);
  return <span ref={ref} data-sn-state-layer="" data-ripple={ripple ? undefined : 'off'} aria-hidden="true" />;
}
