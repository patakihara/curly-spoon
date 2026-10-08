// Design checks: the design data checked on its own (not engine behaviour, so not api/invariants.js).
//   checkDesign(specs) → [{ rule, ok, msg }]
//   1. every param a (temporary, 17.0) motion kind declares gets a value: from the KindStep that uses it, or the param's default.
//   Pieces named by steps are checked by the rules (api/invariants.js, 17.0).

const kindSteps = (list, where) => (list || []).filter(s => s.do === 'kind').map(t => ({ where, t, kind: t.kind }));
const used = specs => [
  ...specs.choreography.rules.flatMap((r, i) => [...kindSteps(r.steps, 'rule ' + i + ' ' + JSON.stringify(r.on)), ...kindSteps(r.reduced, 'rule ' + i + ' reduced')]),
  ...kindSteps(specs.choreography.reduced, 'reduced'),
  ...Object.entries(specs.components).flatMap(([id, C]) => Object.entries(C.motion || {}).flatMap(([k, m]) => kindSteps(m, id + '.motion.' + k)))
];

export function checkDesign(specs) {
  const out = [], add = (rule, msgs) => out.push({ rule, ok: !msgs.length, msg: msgs.join('\n') });
  const missing = [];
  for (const u of used(specs)) {
    const M = (specs.motions || {})[u.kind];
    if (!M) continue;   // undeclared kinds: api/invariants.js
    for (const [p, def] of Object.entries(M.params || {})) if (!(p in u.t) && def.default === undefined) missing.push(u.where + ': ' + u.kind + '.' + p + ' has no value and no default');
  }
  add('every declared motion param has a value (KindStep or default)', missing);
  return out;
}
