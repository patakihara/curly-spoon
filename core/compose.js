// Backdrop Nav — COMPOSITION (draft for 18.0.0): which hire draws a drawn config object, and what that hire is.
// Pure: composition (app/composition.json) + design components → hires. Used by the rules, Layout (sizes) and platforms.

// a place: { contract, page, within: ancestor contracts nearest first, kind?, name?, param?, presentation?, entry?, state?, overlay?, env? }
// page exceptions first, then the defaults; the first placement whose given fields all match wins
// within: the nearest ancestor contract, or the nearest few in order (['appBarPage', 'sheetLayer']: a layer page's)
const nearest = (want, have) => want.every((w, i) => (have || [])[i] === w);
const fits = (p, at) => p.contract === at.contract
  && (!p.within || nearest([].concat(p.within), at.within))
  && (!p.overlay || p.overlay === at.overlay)
  && (!p.match || ((!p.match.kind || p.match.kind === at.kind) && (!p.match.name || p.match.name === at.name)))
  && (!p.param || Object.entries(p.param).every(([k, v]) => at.param && at.param[k] === v))
  && (p.presentation == null || p.presentation === at.presentation)
  && (p.entry == null || !!p.entry === !!at.entry)
  && (p.state == null || p.state === at.state)
  && (!p.env || (at.env && at.env[p.env.env] === p.env.equals));

// → a hire name · null: deliberately not drawn here · undefined: no placement
export function placementFor(composition, at) {
  const page = (composition.pages || []).find(x => x.page === at.page);
  const p = [...(page ? page.placements : []), ...composition.placements].find(x => fits(x, at));
  return p ? p.hire : undefined;
}
export const hireOf = (composition, name) => composition.hires.find(h => h.name === name) || null;

// a free component's own + inherited props, slots, events and variants (design json: props of type 'slot' are slots)
export function freeComponent(components, id, depth = 0) {
  const d = components[id]; if (!d || depth > 8) return null;
  const parent = d.extends ? freeComponent(components, d.extends, depth + 1) : null;
  const own = d.props || {};
  const props = { ...(parent ? parent.props : {}), ...Object.fromEntries(Object.entries(own).filter(([, t]) => t !== 'slot')) };
  const slots = [...(parent ? parent.slots : []), ...Object.keys(own).filter(k => own[k] === 'slot')];
  const events = [...(parent ? parent.events : []), ...(d.events || []).map(e => e.name)];
  const variants = { ...(parent ? parent.variants : {}), ...(d.variants || {}) };
  return { props, slots, events, variants };
}

// a size the hire drawing a place gives: its own token named after the size ('<hire>.<name>', aliasing a design token),
// else its free component's visual of that name (with the hire's variant picks). specs: loaded design (tokens flattened).
import { resolveVisuals } from './layout.js';
export function sizeOf(specs, composition, at, name) {
  const hn = placementFor(composition, at), h = hn ? hireOf(composition, hn) : null; if (!h) return undefined;
  const t = (h.tokens || []).find(x => x.name === h.name + '.' + name);
  if (t) return specs.tokens[t.alias];
  const variant = Object.fromEntries((h.variants || []).map(v => [v.axis, v.option]));
  return resolveVisuals(specs, h.hires, 'enabled', { variant })[name];
}
