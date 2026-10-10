// Backdrop Nav — web: contract nodes → the DCs that draw them (platform plumbing; NOTES decision 32).
// Which DC draws a hired free component comes from design and the platform manifest, not from a hand list: the nearest
// component up its extends chain that platforms/web.json implements, its DC named after it (frontLayer → FrontLayer) —
// so a variant the platform doesn't implement itself is drawn by its parent's DC. Each DC is fed:
//   the node's props (design prop names, clauses resolved) · component (the hired id, so a parent's DC can draw its variants)
//   · visuals (resolved for the node) · its interaction (only for components that extend interactive) · on (one handler per
//   event the node maps) · slots (each slot's nodes, drawn the same way) · motions (its design motions, by name)
//   · symbolVisuals (the symbol component's visuals on its surface) · ixFor(spec) (interaction props for a piece the DC draws itself, e.g. a search field's clear button).
// A component whose options design draws as another component (ComponentDef.option: tabBar → tab) also gets optionProps:
// one per option, the option component's interaction (pressing it sends the node's option event — toggle, change or pick,
// whichever the node maps — with the option's value) and its visuals for the option's status; and moreProps, the same
// for its More (event more), when the node maps one.
// Surface: a node sits on the nearest drawn ancestor whose component provides colour roles (design `provides`); the shell
// names the surface the top node is placed on.
// The shell supplies the context: how to resolve visuals, interaction and events. Nothing here has values of its own.

const pascal = id => id[0].toUpperCase() + id.slice(1);

export function dcOf(specs, id, implemented) {
  for (let c = id; c; c = (specs.components[c] || {}).extends) if (implemented.includes(c)) return pascal(c);
  return null;
}

export function optionOf(specs, id) {
  for (let c = id; c; c = (specs.components[c] || {}).extends) if ((specs.components[c] || {}).option) return specs.components[c].option;
  return null;
}

export function extendsOf(specs, id, base) {
  for (let c = id; c; c = (specs.components[c] || {}).extends) if (c === base) return true;
  return false;
}

// ctx: { specs, implemented (the manifest's component ids), visuals(node, surface, extra?) → resolved visuals,
//   ix(node, surface, piece?) → interaction props (piece: { key, event, payload, component, variant, label } for a piece of the node),
//   motions(node) → its design motions by name, emit(node, event, payload, domEvent) }
const OPTION_EVENTS = ['toggle', 'change', 'pick'];
export function drawNode(n, ctx, surface) {
  if (!n || !n.component) return null;
  const dc = dcOf(ctx.specs, n.component, ctx.implemented), inner = (ctx.specs.components[n.component] || {}).provides ? n.component : surface;
  const props = { ...n.props, component: n.component, visuals: ctx.visuals(n, surface) };
  if (extendsOf(ctx.specs, n.component, 'interactive')) Object.assign(props, ctx.ix(n, surface));
  props.on = Object.fromEntries(Object.keys(n.events || {}).map(ev => [ev, (payload, e) => ctx.emit(n, ev, payload, e)]));
  props.slots = Object.fromEntries(Object.entries(n.slots || {}).map(([k, v]) => [k, v.map(c => drawNode(c, ctx, inner)).filter(Boolean)]));
  props.motions = ctx.motions(n);
  props.symbolVisuals = ctx.visuals({ component: 'symbol', variants: {} }, inner);   // the symbol component's look on this surface, for glyphs a DC draws
  props.ixFor = piece => ctx.ix(n, inner, { key: n.key + '/' + piece.key, ...piece });
  const opt = optionOf(ctx.specs, n.component), ev = OPTION_EVENTS.find(e => n.events && n.events[e]);
  if (opt && Array.isArray(n.props.options)) {
    props.optionProps = n.props.options.map(o => ({ ...ctx.ix(n, inner, { key: n.key + '/' + o.value, event: ev, payload: o.value, component: opt, variant: {}, label: o.label }),
      visuals: ctx.visuals({ component: opt, variants: {} }, inner, { status: o.selected ? ['selected'] : [] }) }));
    if (n.events && n.events.more) props.moreProps = ctx.ix(n, inner, { key: n.key + '/more', event: 'more', component: opt, variant: {}, label: n.props.moreLabel || '' });
  }
  return { key: n.key, dc, is: { [dc]: true }, shown: n.shown !== false, surface, props };
}
