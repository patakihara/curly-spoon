// Backdrop Nav — web: contract nodes → the DCs that draw them (platform plumbing; NOTES decision 32).
// Which DC draws a hired free component comes from design, not from a hand list: a component's own DC is named after it
// (frontLayer → FrontLayer); a variant (design `variant: true`) is drawn by its parent's DC. Each DC is fed:
//   the node's props (design prop names, clauses resolved) · component (the hired id, so a parent's DC can draw its variants)
//   · visuals (resolved for the node) · its interaction (only for components that extend interactive) · on (one handler per
//   event the node maps) · slots (each slot's nodes, drawn the same way).
// Surface: a node sits on the nearest drawn ancestor whose component provides colour roles (design `provides`); the shell
// names the surface the top node is placed on.
// The shell supplies the context: how to resolve visuals, interaction and events. Nothing here has values of its own.

const pascal = id => id[0].toUpperCase() + id.slice(1);

export function dcOf(specs, id) {
  let c = id;
  while (c && specs.components[c] && specs.components[c].variant) c = specs.components[c].extends;
  return c && specs.components[c] ? pascal(c) : null;
}

export function extendsOf(specs, id, base) {
  for (let c = id; c; c = (specs.components[c] || {}).extends) if (c === base) return true;
  return false;
}

// ctx: { specs, visuals(node, surface) → resolved visuals, ix(node, surface) → interaction props, emit(node, event, payload, domEvent) }
export function drawNode(n, ctx, surface) {
  if (!n || !n.component) return null;
  const dc = dcOf(ctx.specs, n.component), inner = (ctx.specs.components[n.component] || {}).provides ? n.component : surface;
  const props = { ...n.props, component: n.component, visuals: ctx.visuals(n, surface) };
  if (extendsOf(ctx.specs, n.component, 'interactive')) Object.assign(props, ctx.ix(n, surface));
  props.on = Object.fromEntries(Object.keys(n.events || {}).map(ev => [ev, (payload, e) => ctx.emit(n, ev, payload, e)]));
  props.slots = Object.fromEntries(Object.entries(n.slots || {}).map(([k, v]) => [k, v.map(c => drawNode(c, ctx, inner)).filter(Boolean)]));
  return { key: n.key, dc, is: { [dc]: true }, shown: n.shown !== false, surface, props };
}
