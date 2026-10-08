// Generates api.d.ts §M2 (role contracts as TypeScript) from api/roles.js. Pure: text in, text out.
//   rolesDts(ROLES)          → the generated block (between the markers)
//   applyRolesDts(dts, ROLES) → api.d.ts with the block replaced
//   rolesDtsInSync(dts, ROLES) → true when api.d.ts matches roles.js

export const BEGIN = '// <roles:generated> — from api/roles.js by api/gen-roles.js; do not edit';
export const END = '// </roles:generated>';
const TS = { string: 'string', number: 'number', boolean: 'boolean', 'string[]': 'string[]', value: 'ParamValue', options: 'ParamOption[]', list: 'unknown[]' };
const pascal = s => s[0].toUpperCase() + s.slice(1);
const fields = o => Object.entries(o).map(([k, t]) => k + ': ' + t).join('; ');
const slotText = S => Object.entries(S).map(([k, c]) => k + [c.max != null ? '≤' + c.max : '', c.first ? 'first ' + c.first : '', c.last ? 'last ' + c.last : '', c.roles ? c.roles.join('|') : ''].filter(Boolean).map(x => ' ' + x).join('')).join(' · ');
const partText = P => Object.entries(P).map(([k, p]) => k + (p.optional ? '?' : '') + ' ← ' + p.field + (p.role ? ' (' + p.role + ')' : '')).join(' · ');

export function rolesDts(ROLES) {
  const L = [BEGIN];
  for (const [id, R] of Object.entries(ROLES)) {
    const ts = R.ts || {}, sup = Object.fromEntries(Object.entries(R.supplies).map(([k, t]) => [k, (ts.supplies || {})[k] || TS[t] || 'unknown']));
    const ev = Object.fromEntries(Object.keys(R.emits).map(k => [k, (ts.emits || {})[k] || 'unknown']));
    const info = [R.slots ? 'slots ' + slotText(R.slots) : '', R.parts ? 'parts ' + partText(R.parts) : '', R.note || ''].filter(Boolean).join(' — ');
    L.push('// ' + id + (info ? ': ' + info : ''));
    if (Object.keys(sup).length) L.push('export interface ' + pascal(id) + 'Supplies { ' + fields(sup) + ' }');
    if (Object.keys(ev).length) L.push('export interface ' + pascal(id) + 'Events { ' + fields(ev) + ' }');
  }
  L.push(END);
  return L.join('\n');
}
export function applyRolesDts(dts, ROLES) {
  const a = dts.indexOf(BEGIN), b = dts.indexOf(END);
  if (a < 0 || b < a) throw new Error('api.d.ts has no roles:generated markers');
  return dts.slice(0, a) + rolesDts(ROLES) + dts.slice(b + END.length);
}
export const rolesDtsInSync = (dts, ROLES) => { try { return applyRolesDts(dts, ROLES) === dts; } catch (e) { return false; } };
