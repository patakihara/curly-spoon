// Generates the contract types in api/api.d.ts (section M2) from api/contracts.js. Pure: text in, text out.
//   contractsDts(CONTRACTS, UNIONS, INTENT_TS)       → the generated block (between the markers)
//   applyContractsDts(dts, CONTRACTS, UNIONS, INTENT_TS) → the file with the block replaced
//   contractsDtsInSync(dts, CONTRACTS, UNIONS, INTENT_TS) → true when the file matches contracts.js

export const BEGIN = '// <contracts:generated> — from api/contracts.js by api/gen-contracts.js; do not edit';
export const END = '// </contracts:generated>';
const pascal = s => s[0].toUpperCase() + s.slice(1), P_ = pascal;
const fields = o => Object.entries(o).map(([k, t]) => k + ': ' + t).join('; ');

export function contractsDts(CONTRACTS, UNIONS, INTENT_TS) {
  const L = [BEGIN], unionsDone = new Set();
  const childType = c => pascal(c.contract) + 'Contract' + (c.list ? '[]' : '');   // a union's name is built the same way
  const needUnions = C => {
    for (const c of Object.values(C.children || {})) {
      const u = UNIONS[c.contract];
      if (u && !unionsDone.has(c.contract)) {
        L.push(`export type ${pascal(c.contract)}Contract = ${u.map(m => pascal(m) + 'Contract').join(' | ')};`);
        unionsDone.add(c.contract);
      }
    }
  };
  for (const [id, C] of Object.entries(CONTRACTS)) {
    needUnions(C);
    // extends: the other contract's values, intents and children, plus its own (each type extends the other's)
    const B = C.extends ? CONTRACTS[C.extends] : null, BP = B ? pascal(C.extends) : null;
    const own = Object.keys(C.values).length > 0, baseVals = B && Object.keys(B.values).length ? BP + 'Values' : 'NoValues';
    const vals = own ? P_(id) + 'Values' : B ? baseVals : 'NoValues';
    const allIntents = [...(B ? B.intents : []), ...C.intents];
    const intents = allIntents.length ? allIntents.map(t => INTENT_TS[t] || 'unknown').join(' | ') : 'NoIntents';
    const kids = C.children && Object.keys(C.children).length ? C.children : null, baseKids = B && B.children && Object.keys(B.children).length;
    const P = P_(id), selfRef = kids && Object.values(kids).some(c => c.contract === id);
    L.push('// ' + id + (C.extends ? ' (extends ' + C.extends + ')' : '') + (C.note ? ': ' + C.note : '') + (selfRef ? ' (recursive: refers to itself)' : ''));
    if (own) L.push(`export interface ${P}Values${B && baseVals !== 'NoValues' ? ' extends ' + baseVals : ''} { ${fields(C.values)} }`);
    if (kids) L.push(`export interface ${P}Children${baseKids ? ' extends ' + BP + 'Children' : ''} { ${Object.entries(kids).map(([k, c]) => k + (c.optional ? '?' : '') + ': ' + childType(c)).join('; ')} }`);
    const kidsType = kids ? P + 'Children' : baseKids ? BP + 'Children' : null;
    L.push(`export interface ${P}Contract extends Contract<${C.config}, ${vals}, ${intents}> {${kidsType ? ` children: ${kidsType} ` : ''}}`);
  }
  L.push(`export type ContractName = ${Object.keys(CONTRACTS).map(k => `'${k}'`).join(' | ')};`);
  L.push(END);
  return L.join('\n');
}
export function applyContractsDts(dts, CONTRACTS, UNIONS, INTENT_TS) {
  const a = dts.indexOf(BEGIN), b = dts.indexOf(END);
  if (a < 0 || b < a) throw new Error('api.d.ts has no contracts:generated markers');
  return dts.slice(0, a) + contractsDts(CONTRACTS, UNIONS, INTENT_TS) + dts.slice(b + END.length);
}
export const contractsDtsInSync = (dts, ...a) => { try { return applyContractsDts(dts, ...a) === dts; } catch (e) { return false; } };
