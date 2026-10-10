// Backdrop Nav — web: collapse-first scrolling (API 15.0) on any scroll surface (platform mechanics: input → offsets).
// While a page's bar is (partly) expanded, wheel / touch input on a surface collapses or expands the bar instead of
// scrolling it (the page grows); native scrolling takes over once the bar has collapsed. The page's scroll is one offset:
// the collapsed part (0 … distance) plus the surface's own native offset. Nothing here has values of its own: the
// distance and the current offset come from the engine (Layout.barView, the page state) through `state`.
//
// bind(el, s): makes el a collapse-first surface. s: { state() → { distance, top } (top: the page's offset on this
//   surface), send(top) (an absolute offset, while the bar collapses), native?(top, e) (an absolute offset, from a native
//   scroll of el) }. Binds once per element; a later call replaces s.
// forward(el, target): wheel / touch on el (a surface that does not scroll itself, e.g. a header's detail) act on
//   target() — a bound surface — as if they happened there.
// offsetOf(state) → the native offset the surface should hold: the page's offset past the collapse.
export function offsetOf({ distance, top }) { return Math.max(0, top - (distance || 0)); }

const deltaOf = (e, el) => e.deltaY * (e.deltaMode === 1 ? el.clientHeight / 20 : e.deltaMode === 2 ? el.clientHeight : 1);

// dy on a bound surface: collapse / expand the bar first; false when the surface should scroll natively instead
function take(el, dy, e) {
  const s = el._cf; if (!s || !dy) return false;
  const { distance: d, top } = s.state(); if (!d) return false;
  const c = Math.min(+top || 0, d);
  let next;
  if (dy > 0 && c < d) next = Math.min(d, c + dy);
  else if (dy < 0 && el.scrollTop <= 0 && c > 0) next = Math.max(0, c + dy);
  else return false;
  if (e && e.cancelable) e.preventDefault();
  s.send(next); return true;
}

function listen(src, target) {
  let y = null, manual = false;
  src.addEventListener('wheel', e => { const t = target(); if (!t) return; const dy = deltaOf(e, t); if (take(t, dy, e)) return; if (src !== t) { if (e.cancelable) e.preventDefault(); t.scrollTop += dy; } }, { passive: false });
  src.addEventListener('touchstart', e => { y = e.touches[0].clientY; manual = false; }, { passive: true });
  src.addEventListener('touchmove', e => {
    const t = target(); if (y == null || !t) return; const ny = e.touches[0].clientY, dy = y - ny; y = ny;
    if (take(t, dy, e)) { manual = true; return; }
    if ((manual || src !== t) && e.cancelable) { e.preventDefault(); t.scrollTop += dy; }   // a gesture that began collapsing the bar (or one forwarded) keeps scrolling by hand
  }, { passive: false });
  src.addEventListener('touchend', () => { y = null; manual = false; }, { passive: true });
}

export function bind(el, s) {
  if (!el) return;
  if (el._cf) { el._cf = s; return; }   // already bound: keep the newest state / send
  el._cf = s;
  listen(el, () => el);
  el.addEventListener('scroll', e => { const st = el._cf; if (!st || !st.native) return; const { distance: d, top } = st.state(); st.native((d ? Math.min(+top || 0, d) : 0) + el.scrollTop, e); }, { passive: true });
}

export function forward(el, target) {
  if (!el || el._cfFwd) return; el._cfFwd = true;
  listen(el, target);
}
