// Backdrop Nav — COMPOSITION (draft for 18.0.0): which hire draws a drawn config object, and what that hire is.
// Pure: composition (app/composition.json) + design components → hires. Used by the rules, Layout (sizes) and platforms.

// a place: { contract, page, within: ancestor contracts nearest first, kind?, name?, param?, presentation?, state?, overlay?, env? }
// page exceptions first, then the defaults; the first placement whose given fields all match wins
// within: the nearest ancestor contract, or the nearest few in order (['appBarPage', 'sheetLayer']: a layer page's)
const nearest = (want, have) => want.every((w, i) => (have || [])[i] === w);
const fits = (p, at) => p.contract === at.contract
  && (!p.within || nearest([].concat(p.within), at.within))
  && (!p.overlay || p.overlay === at.overlay)
  && (!p.match || ((!p.match.kind || p.match.kind === at.kind) && (!p.match.name || p.match.name === at.name)))
  && (!p.param || Object.entries(p.param).every(([k, v]) => at.param && at.param[k] === v))
  && (p.presentation == null || p.presentation === at.presentation)
  && (p.state == null || p.state === at.state)
  && (!p.env || (at.env && at.env[p.env.env] === p.env.equals));

// → a hire name · null: deliberately not drawn here · undefined: no placement
export function placementFor(composition, at) {
  const page = (composition.pages || []).find(x => x.page === at.page);
  const p = [...(page ? page.placements : []), ...composition.placements].find(x => fits(x, at));
  return p ? p.hire : undefined;
}
export const hireOf = (composition, name) => composition.hires.find(h => h.name === name) || null;

// a free component's own + inherited props, slots, events, variants and optional props (design json: props of type 'slot' are slots)
export function freeComponent(components, id, depth = 0) {
  const d = components[id]; if (!d || depth > 8) return null;
  const parent = d.extends ? freeComponent(components, d.extends, depth + 1) : null;
  const own = d.props || {};
  const props = { ...(parent ? parent.props : {}), ...Object.fromEntries(Object.entries(own).filter(([, t]) => t !== 'slot')) };
  const slots = [...(parent ? parent.slots : []), ...Object.keys(own).filter(k => own[k] === 'slot')];
  const events = [...(parent ? parent.events : []), ...(d.events || []).map(e => e.name)];
  const variants = { ...(parent ? parent.variants : {}), ...(d.variants || {}) };
  const optional = [...new Set([...(parent ? parent.optional : []), ...(d.optional || [])])];
  return { props, slots, events, variants, optional };
}

// a size the hire drawing a place gives: its own token named after the size ('<hire>.<name>', aliasing a design token),
// else its free component's visual of that name (with the hire's variant picks). specs: loaded design (tokens flattened).
import { resolveVisuals } from './layout.js';
// a hire's visuals at a place, for a state: the free component's (with the hire's variant picks), its own tokens winning
export function visualsAt(specs, composition, at, state = 'enabled', ctx = {}) {
  const hn = placementFor(composition, at), h = hn ? hireOf(composition, hn) : null; if (!h) return null;
  const variant = Object.fromEntries((h.variants || []).map(v => [v.axis, v.option]));
  const out = resolveVisuals(specs, h.hires, state, { ...ctx, env: at.env, variant });
  for (const t of h.tokens || []) out[t.name.slice(h.name.length + 1)] = specs.tokens[t.alias];
  return out;
}
export function sizeOf(specs, composition, at, name, state = 'enabled') { const v = visualsAt(specs, composition, at, state); return v ? v[name] : undefined; }
// the look at the current env: what Layout reads instead of config sizes (design through composition)
//   size(at, name, state?) → number (0 where nothing is drawn) · visuals(at, state?, ctx?) → the hire's visuals | null
export const lookAt = (specs, composition, env) => ({
  size: (at, name, state) => +(sizeOf(specs, composition, { ...at, env }, name, state) || 0),
  visuals: (at, state, ctx) => visualsAt(specs, composition, { ...at, env }, state, ctx),
  hire: at => placementFor(composition, { ...at, env }) || null,
});
