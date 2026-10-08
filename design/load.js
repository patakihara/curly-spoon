// Design system loader: assembles design/ into the Specs object of api.d.ts §15.
// read(path) → Promise<string>, path relative to design/ (browser: fetch; tools: readFile).

export function flattenTokens(t, prefix = '', out = {}) {
  for (const k in t) {
    if (k[0] === '$') continue;
    const v = t[k], name = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && '$value' in v) out[name] = v.$value;
    else if (v && typeof v === 'object') flattenTokens(v, name, out);
  }
  return out;
}

export async function loadDesignRaw(read) {
  const man = JSON.parse(await read('design.json'));
  const [tokens, choreography, ...comps] = await Promise.all([
    read(man.tokens).then(JSON.parse),
    read(man.choreography).then(JSON.parse),
    ...man.components.map(id => read('components/' + id + '/' + id + '.json').then(JSON.parse))
  ]);
  const mids = man.motions || [], mots = await Promise.all(mids.map(id => read('motions/' + id + '.json').then(JSON.parse)));
  return { contractVersion: man.contractVersion, tokens: flattenTokens(tokens), components: Object.fromEntries(man.components.map((id, i) => [id, comps[i]])), choreography, motions: Object.fromEntries(mids.map((id, i) => [id, mots[i]])) };
}

// extends: a child inherits its parent's optional props and statuses (union), props and variants (merged), states (unless it lists its own)
// and visuals (merged per visual and state); the child's own values win. `extends` / `variant` stay on the result.
export function resolveExtends(raw) {
  const done = {}, J = v => JSON.parse(JSON.stringify(v));
  const res = (id, chain) => {
    if (done[id]) return done[id];
    const C = raw.components[id];
    if (!C) throw new Error('unknown component ' + id + (chain.length ? ' (extended by ' + chain[chain.length - 1] + ')' : ''));
    if (chain.includes(id)) throw new Error('extends cycle: ' + [...chain, id].join(' → '));
    if (!C.extends) return (done[id] = J(C));
    const P = res(C.extends, [...chain, id]), m = J(C);
    const props = { ...(P.props || {}), ...(C.props || {}) };
    if (Object.keys(props).length) m.props = props;
    if (!C.states && P.states) m.states = J(P.states);
    const opt = [...new Set([...(P.optional || []), ...(C.optional || [])])];
    if (opt.length) m.optional = opt;
    const sts = [...new Set([...(P.statuses || []), ...(C.statuses || [])])];
    if (sts.length) m.statuses = sts;
    const vis = J(P.visuals || {});
    for (const v in C.visuals || {}) vis[v] = { ...(vis[v] || {}), ...C.visuals[v] };
    if (Object.keys(vis).length) m.visuals = vis;
    const mo = { ...J(P.motion || {}), ...J(C.motion || {}) };
    if (Object.keys(mo).length) m.motion = mo;
    if (!C.placeholder && P.placeholder) m.placeholder = J(P.placeholder);
    const parts = [...new Set([...(P.parts || []), ...(C.parts || [])])];   // 17.0: inherited
    if (parts.length) m.parts = parts;
    const va = { ...J(P.variants || {}), ...J(C.variants || {}) };
    if (Object.keys(va).length) m.variants = va;
    return (done[id] = m);
  };
  return { ...raw, components: Object.fromEntries(Object.keys(raw.components).map(id => [id, res(id, [])])) };
}

export async function loadDesign(read) { return resolveExtends(await loadDesignRaw(read)); }

// usage notes (component.md), for previews and docs
export async function loadNotes(read, ids) {
  const out = {};
  await Promise.all(ids.map(async id => { try { out[id] = (await read('components/' + id + '/' + id + '.md')).replace(/^#.*\n+/, '').trim(); } catch (e) { out[id] = ''; } }));
  return out;
}
