// Specs Editor overrides: stored as a PATCH (only what the user changed), applied on top of the design system (design/, assembled by load.js).
// Anything not in the patch always comes from the file, so file updates are never masked by old saves.
// Patches apply to the raw design (before extends is resolved), so a change to a parent reaches its children.
// patch = { tokens?: {name: value}, components?: {id: {visuals?: {visual: {state: value | '$unset'}}}},
//           choreography?: { rules?: {JSON(on): steps}, reduced?: steps } }

export const PATCH_KEY = 'backdrop-nav-specs-patch';
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = v => JSON.parse(JSON.stringify(v));
const ruleKey = r => JSON.stringify(r.on);

export function diffSpecs(file, s) {
  const p = {};
  const tokens = {};
  for (const k in s.tokens) if (!eq(s.tokens[k], file.tokens[k])) tokens[k] = s.tokens[k];
  if (Object.keys(tokens).length) p.tokens = tokens;

  const components = {};
  for (const id in s.components) {
    const C = s.components[id], F = file.components[id] || {}, out = {};
    const a = C.visuals || {}, b = F.visuals || {}, vis = {};
    for (const v of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const av = a[v] || {}, bv = b[v] || {};
      for (const st of new Set([...Object.keys(av), ...Object.keys(bv)])) {
        if (!(st in av)) (vis[v] = vis[v] || {})[st] = '$unset';
        else if (!eq(av[st], bv[st])) (vis[v] = vis[v] || {})[st] = av[st];
      }
    }
    if (Object.keys(vis).length) out.visuals = vis;
    if (Object.keys(out).length) components[id] = out;
  }
  if (Object.keys(components).length) p.components = components;

  const fr = Object.fromEntries(file.choreography.rules.map(r => [ruleKey(r), r.steps])), rules = {};
  s.choreography.rules.forEach(r => { if (!eq(r.steps, fr[ruleKey(r)])) rules[ruleKey(r)] = r.steps; });
  const ch = {};
  if (Object.keys(rules).length) ch.rules = rules;
  if (!eq(s.choreography.reduced, file.choreography.reduced)) ch.reduced = s.choreography.reduced;
  if (Object.keys(ch).length) p.choreography = ch;
  return p;
}

export function applySpecs(file, p) {
  const s = clone(file);
  if (!p) return s;
  Object.assign(s.tokens, p.tokens || {});
  for (const id in p.components || {}) {
    const C = s.components[id], P = p.components[id];
    if (!C) continue;
    for (const v in P.visuals || {}) {
      C.visuals = C.visuals || {};
      const row = C.visuals[v] = { ...(C.visuals[v] || {}) };
      for (const st in P.visuals[v]) { if (P.visuals[v][st] === '$unset') delete row[st]; else row[st] = P.visuals[v][st]; }
      if (!Object.keys(row).length) delete C.visuals[v];
    }
  }
  const ch = p.choreography || {};
  s.choreography.rules.forEach(r => { const t = (ch.rules || {})[ruleKey(r)]; if (Array.isArray(t)) r.steps = clone(t); });   // pre-17.0 patches (single transitions) are ignored
  if (Array.isArray(ch.reduced)) s.choreography.reduced = clone(ch.reduced);
  return s;
}
