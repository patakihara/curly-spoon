// Design checks: the design data checked on its own (not engine behaviour, so not api/invariants.js).
//   checkDesign(specs) → [{ rule, ok, msg }]
//   1. every param a (temporary, 17.0) motion kind declares gets a value: from the KindStep that uses it, or the param's default.
//   2. a component's option (the component each of its options is drawn as) is registered and interactive.
//   3. a pick (a child fixing an inherited setting) names a declared axis and one of its options.
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
  const C = specs.components, interactive = (id, k = 0) => k < 9 && !!C[id] && (id === 'interactive' || interactive(C[id].extends, k + 1));
  add('every option component is registered and interactive', Object.entries(C).filter(([, c]) => c.option)
    .filter(([, c]) => !interactive(c.option)).map(([id, c]) => id + '.option ' + c.option + (C[c.option] ? ' is not interactive' : ' is not registered')));
  add('every pick names a setting (variant axis) the component has, and one of its options', Object.entries(C).flatMap(([id, c]) => Object.entries(c.picks || {})
    .filter(([ax, o]) => !(c.variants && c.variants[ax] && c.variants[ax].options.includes(o))).map(([ax, o]) => id + '.picks.' + ax + ' = ' + o)));
  return out;
}
