#!/usr/bin/env node
/**
 * Card writeback CLI — the production form of the prototype proved out in
 * .probe/writeback.mjs (30/30 assertions, byte-identical round trips against real tracked
 * cards; see .probe/writeback-design.md for the fuller writeup). docs/serve.py shells out to
 * this one JSON object at a time over stdin/stdout, the same way it already shells out to
 * `code` and `claude` for the other two side effects it cannot do in pure Python — there is no
 * JS parser in the standard library, and a full custom one is not warranted for six properties.
 *
 * Protocol: one JSON object on stdin, one JSON object on stdout, exit 0 always (a thrown error
 * is caught and reported as {ok:false, reason:"exception", message} rather than a bare stack
 * trace on stderr — docs/serve.py has no way to tell "malformed input" from "node itself is
 * broken" apart from parsing stdout, so stdout is always valid JSON no matter what went wrong).
 *
 *   { "op": "resolve", "file": "<abs path>", "charOffset": <int>, "property": "gap" }
 *   { "op": "apply",   "file": "<abs path>", "charOffset": <int>, "property": "gap",
 *     "newValue": 24, "allowMissing": true, "allowUnset": false }
 *
 * `charOffset` is the JSXOpeningElement's `node.start` inside the inline babel script's OWN
 * text — exactly the number a stamped `data-om-id` carries as its second field
 * (`jsx:/Inline Babel script:<charOffset>:<line>:<col>`). Character offset is the primary
 * locator, not line:col: the adversarial re-check (see CLAUDE.md) found that the column half of
 * line:col breaks by exactly the tag's own length whenever a card's JSX begins on the
 * `<script type="text/babel">` tag's own line — a real, if currently latent, bug. An offset
 * measured from the same script text babel_line/col are measured from has no such failure mode,
 * so it is what this file matches on; line/col are accepted as a fallback (see resolveNode)
 * only for callers (tests, manual probing) that don't have an offset handy, and are documented
 * as the less trustworthy path for exactly that reason.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// The repo's own @babel/standalone carries the parser; resolved from the repo's node_modules.
const parser = require('@babel/standalone').packages.parser;

const KEBAB_TO_CAMEL = {
  'border-radius': 'borderRadius',
  background: 'background',
  gap: 'gap',
  display: 'display',
  width: 'width',
  'font-weight': 'fontWeight',
};

// Per the Pro-panel spec (pro-panel-spec.md #6): Regular/Medium/etc. are the editor's *display*
// labels for a numeric font-weight scale; the card files themselves always author the number
// (grep across components/**/*.card.html — none authors the word). Both directions are needed:
// the panel shows the name, the file keeps the number.
const NAMED_WEIGHTS = {
  Thin: 100, 'Extra light': 200, Light: 300, Regular: 400, Medium: 500,
  Semibold: 600, Bold: 700, 'Extra bold': 800, Black: 900,
};

const BABEL_TAG_RE = /<script\b[^>]*\btype=["']text\/babel["'][^>]*>/i;

function findScriptBounds(src) {
  const m = BABEL_TAG_RE.exec(src);
  if (!m) throw new Error('no inline babel script found');
  const tagLine = src.slice(0, m.index).split('\n').length; // 1-indexed line the tag itself sits on
  // contentStart is immediately after the tag's own '>' — NOT past the newline that follows it.
  // This has to match `<script>.textContent` byte-for-byte, because the browser's injected omid
  // plugin (docs/serve.py: _SRCMAP_PLUGIN_BODY) parses that exact string and stamps `node.start`
  // offsets relative to it; skipping the leading newline here would silently shift every
  // charOffset this file resolves by 1 relative to what a real data-om-id carries. (This is also
  // why babel line 1 is the empty tail of the tag's own line, not the first content line — see
  // the module comment above BABEL_TAG_RE.)
  const contentStart = m.index + m[0].length;
  const closeIdx = src.indexOf('</script>', contentStart);
  if (closeIdx === -1) throw new Error('inline babel script has no closing tag');
  const scriptSrc = src.slice(contentStart, closeIdx);
  return { tagLine, contentStart, scriptSrc };
}

function parseScript(scriptSrc) {
  return parser.parse(scriptSrc, { sourceType: 'module', plugins: ['jsx'] });
}

function walk(node, cb) {
  if (!node || typeof node.type !== 'string') return;
  cb(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'range') continue;
    const val = node[key];
    if (Array.isArray(val)) val.forEach((v) => v && typeof v.type === 'string' && walk(v, cb));
    else if (val && typeof val.type === 'string') walk(val, cb);
  }
}

/** Find the JSXOpeningElement at a script-relative character offset, or by babel line:col. */
function findOpeningElement(ast, { charOffset, babelLine, babelCol }) {
  let hit = null;
  walk(ast.program, (node) => {
    if (node.type !== 'JSXOpeningElement') return;
    if (typeof charOffset === 'number') {
      if (node.start === charOffset) hit = node;
    } else if (node.loc.start.line === babelLine && node.loc.start.column === babelCol) {
      hit = node;
    }
  });
  return hit;
}

/** Fragments produce no DOM node (see the adversarial re-check's finding #1) — an om-id can
 * technically still land on one (nothing on the writer side prevents it), and there is no style
 * attribute a fragment could sensibly carry, so treat it as "no element" up front rather than
 * falling through to "no style attribute" below, which would read as a different kind of miss. */
function isFragment(openingEl) {
  const n = openingEl.name;
  return n.type === 'JSXIdentifier' && n.name === 'React.Fragment' || (
    n.type === 'JSXMemberExpression' && n.object.name === 'React' && n.property.name === 'Fragment'
  );
}

function getStyleObject(openingEl) {
  const attr = openingEl.attributes.find(
    (a) => a.type === 'JSXAttribute' && a.name && a.name.name === 'style'
  );
  if (!attr || !attr.value || attr.value.type !== 'JSXExpressionContainer') return null;
  const expr = attr.value.expression;
  if (expr.type !== 'ObjectExpression') return null;
  return expr;
}

function findProperty(objExpr, jsKey) {
  return objExpr.properties.find(
    (p) => p.type === 'ObjectProperty' &&
      ((p.key.type === 'Identifier' && p.key.name === jsKey) ||
        (p.key.type === 'StringLiteral' && p.key.value === jsKey))
  );
}

/** Literal vs. token-authored vs. a shape this slice doesn't handle. */
function classifyValue(valueNode) {
  if (valueNode.type === 'StringLiteral' && /var\(--[\w-]+\)/.test(valueNode.value)) {
    const m = /var\((--[\w-]+)\)/.exec(valueNode.value);
    return { kind: 'token', token: m[1], resolved: valueNode.value };
  }
  if (valueNode.type === 'NumericLiteral') return { kind: 'literal', resolved: valueNode.value };
  if (valueNode.type === 'StringLiteral') return { kind: 'literal', resolved: valueNode.value };
  return { kind: 'unsupported', resolved: null };
}

function resolve({ file, charOffset, line, col, property }) {
  const src = readFileSync(file, 'utf8');
  const { scriptSrc } = findScriptBounds(src);
  const ast = parseScript(scriptSrc);
  const locator = typeof charOffset === 'number'
    ? { charOffset }
    : { babelLine: line, babelCol: col };
  const openingEl = findOpeningElement(ast, locator);
  const jsKey = KEBAB_TO_CAMEL[property] || property;
  if (!openingEl) {
    return { ok: true, elementFound: false, jsKey };
  }
  if (isFragment(openingEl)) {
    return { ok: true, elementFound: false, jsKey, reason: 'fragment-no-dom-node' };
  }
  const tagName = openingEl.name.type === 'JSXIdentifier' ? openingEl.name.name : null;
  const styleObj = getStyleObject(openingEl);
  if (!styleObj) {
    return { ok: true, elementFound: true, tagName, hasStyleAttr: false, jsKey, property: null };
  }
  const propNode = findProperty(styleObj, jsKey);
  if (!propNode) {
    return {
      ok: true, elementFound: true, tagName, hasStyleAttr: true, jsKey, property: 'missing',
      styleObjEnd: styleObj.end, styleObjHasProps: styleObj.properties.length > 0,
    };
  }
  const cls = classifyValue(propNode.value);
  return {
    ok: true, elementFound: true, tagName, hasStyleAttr: true, jsKey, property: 'present',
    authoredKind: cls.kind, authoredToken: cls.token, resolvedValue: cls.resolved,
    valueStart: propNode.value.start, valueEnd: propNode.value.end,
    propStart: propNode.start, propEnd: propNode.end,
    styleObjEnd: styleObj.end, styleObjHasProps: styleObj.properties.length > 0,
  };
}

function serializeValue(jsKey, newValue) {
  if (jsKey === 'width') {
    // Per pro-panel-spec.md #3: Hug deletes the declaration (handled by the caller passing
    // allowUnset instead of calling serializeValue at all); this only ever renders Fixed/Fill.
    if (newValue === 'fill') return `'100%'`;
    const n = Math.round(Number(newValue)) || 100;
    return String(n);
  }
  if (jsKey === 'fontWeight' && NAMED_WEIGHTS[newValue] !== undefined) {
    return String(NAMED_WEIGHTS[newValue]);
  }
  if (typeof newValue === 'number') return String(newValue);
  if (/^-?\d+(\.\d+)?$/.test(String(newValue)) && (jsKey === 'gap' || jsKey === 'borderRadius')) {
    return String(newValue);
  }
  return `'${String(newValue).replace(/'/g, "\\'")}'`;
}

function deleteProperty(scriptSrc, propStart, propEnd) {
  let start = propStart, end = propEnd;
  const after = scriptSrc.slice(propEnd).match(/^\s*,\s*/);
  if (after) {
    end = propEnd + after[0].length;
  } else {
    const before = scriptSrc.slice(0, propStart).match(/,\s*$/);
    if (before) start = propStart - before[0].length;
  }
  return scriptSrc.slice(0, start) + scriptSrc.slice(end);
}

function apply({ file, charOffset, line, col, property, newValue, allowMissing = false, allowUnset = false }) {
  const r = resolve({ file, charOffset, line, col, property });
  if (!r.ok) return r;
  if (!r.elementFound) return { ok: false, reason: r.reason || 'element-not-found' };

  const src = readFileSync(file, 'utf8');
  const { tagLine, contentStart, scriptSrc } = findScriptBounds(src);

  let newScriptSrc;
  if (r.property === 'present') {
    if (r.authoredKind === 'token') {
      return { ok: false, reason: 'token-authored', token: r.authoredToken, resolvedValue: r.resolvedValue };
    }
    if (r.authoredKind !== 'literal') {
      return { ok: false, reason: 'unsupported-value-shape' };
    }
    if (allowUnset && newValue === undefined) {
      newScriptSrc = deleteProperty(scriptSrc, r.propStart, r.propEnd);
    } else {
      const replacement = serializeValue(r.jsKey, newValue);
      newScriptSrc = scriptSrc.slice(0, r.valueStart) + replacement + scriptSrc.slice(r.valueEnd);
    }
  } else if (r.property === 'missing') {
    if (allowUnset) return { ok: true, changed: false, reason: 'already-unset' };
    if (!allowMissing) return { ok: false, reason: 'property-not-present', hint: 'pass allowMissing:true to insert' };
    const replacement = serializeValue(r.jsKey, newValue);
    const insertion = (r.styleObjHasProps ? ',' : '') + r.jsKey + ':' + replacement;
    newScriptSrc = scriptSrc.slice(0, r.styleObjEnd - 1) + insertion + scriptSrc.slice(r.styleObjEnd - 1);
  } else {
    if (allowUnset) return { ok: true, changed: false, reason: 'already-unset' };
    return { ok: false, reason: 'no-style-attribute' };
  }

  if (newScriptSrc === scriptSrc) {
    return { ok: true, changed: false, reason: 'already-equal' };
  }
  const newSrc = src.slice(0, contentStart) + newScriptSrc + src.slice(contentStart + scriptSrc.length);
  writeFileSync(file, newSrc);
  return { ok: true, changed: true, tagLine };
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { raw += d; });
  process.stdin.on('end', () => {
    let out;
    try {
      const input = JSON.parse(raw || '{}');
      if (input.op === 'resolve') out = resolve(input);
      else if (input.op === 'apply') out = apply(input);
      else out = { ok: false, reason: 'unknown-op' };
    } catch (e) {
      out = { ok: false, reason: 'exception', message: String(e && e.message || e) };
    }
    process.stdout.write(JSON.stringify(out));
  });
}

main();

export const _internal = { findScriptBounds, parseScript, findOpeningElement, getStyleObject, findProperty, classifyValue, resolve, apply };
