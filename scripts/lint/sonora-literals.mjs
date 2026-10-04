#!/usr/bin/env node
/**
 * Sonora's hard-coding check (M0.sonoraclean). Every size, colour, opacity, duration, easing,
 * z-index, line-height and letter-spacing in Sonora's components and in Android's ui/sonora is a
 * token. This finds the raw literals left, past one allowlist for true geometry.
 *
 *   node scripts/lint/sonora-literals.mjs            # check: exits 1 on a finding or a stale entry
 *   node scripts/lint/sonora-literals.mjs --report   # counts per file and per kind, exits 0
 *
 * JSX (design/sonora/components/**\/*.jsx) is read with the TypeScript AST. Every string literal
 * and template chunk is read as CSS, joined across `+` and `${}` so a value split over pieces is
 * still seen; that covers sx() strings, style values and injected <style> text. A named colour
 * counts only in a colour position (a colour property, a JSX colour attribute, or inside
 * color-mix, a gradient or drop-shadow), so prose such as "black and white" is never one. Numbers
 * count where they are object values (style keys, size maps), all-number arrays (ramps), size- or
 * timing-named defaults and JSX props, timer delays, and bounds of Math.min/max/clamp, read in the
 * context of the result. Ratios (an operand of `*` or `/`, a unitless number inside calc()) are
 * not literals, nor is geometry on SVG elements (`r`, `cx`, `width`, `strokeWidth` on a circle).
 *
 * Kotlin (android/sonora/src/main/java/.../ui/sonora) is read by pattern: `N.dp`, `N.sp`, `N.em`,
 * `(N).dp`, `Dp(N)`, `Color(0x…)`, `alpha = N`, `.alpha(N`, `tween(N` and `tween<T>(N`,
 * `durationMillis = N`, `delayMillis = N`, spring `stiffness = N` and `dampingRatio = N`, and
 * `zIndex(N`.
 *
 * Exempt everywhere: the value 0, `100%`, `@keyframes` blocks, and the generated token files
 * (tokens/, export/, any `generated` folder), which sit outside the scanned folders.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import ts from 'typescript';
import { z } from 'zod';

export const JSX_DIR = 'design/sonora/components';
export const KOTLIN_DIR = 'android/sonora/src/main/java/net/develivarr/auralis/ui/sonora';
export const ALLOWLIST_FILE = 'scripts/lint/sonora-literals-allow.json';

const nonEmpty = (name) =>
  z.string({ required_error: `${name} is required` }).min(1, `${name} is empty`);
const AllowEntry = z
  .object({ file: nonEmpty('file'), literal: nonEmpty('literal'), reason: nonEmpty('reason') })
  .strict();
const Allowlist = z.array(AllowEntry);

/** Parses the allowlist: an array of `{file, literal, reason}`, each a non-empty string. */
export function parseAllowlist(json) {
  const parsed = Allowlist.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`${ALLOWLIST_FILE} is malformed: ${issues.join('; ')}`);
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------------------------
// CSS text

const BOX_PROPS = new Set([
  'width',
  'height',
  'min-width',
  'max-width',
  'min-height',
  'max-height',
  'inline-size',
  'block-size',
  'top',
  'left',
  'right',
  'bottom',
  'inset',
  'flex-basis',
  'gap',
  'row-gap',
  'column-gap',
]);
const BOX_PREFIXES = [
  'inset-',
  'margin',
  'padding',
  'border-radius',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
];
const isBoxProp = (p) => BOX_PROPS.has(p) || BOX_PREFIXES.some((b) => p.startsWith(b));
const UNITLESS_PROPS = new Set(['z-index', 'opacity', 'line-height', 'letter-spacing']);

const isZero = (num) => Number(num.replace(/[a-z%]+$/i, '').replace(/f$/, '')) === 0;
const COLOUR_FN = /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g;
const BEZIER_FN = /(?<![\w-])(?:cubic-bezier|steps)\(/g;
const HEX = /(?<![\w&#])#[0-9a-fA-F]{3,8}(?![\w-])/g;
/** Every CSS named colour (CSS Color 4), matched case-insensitively and only in a colour position. */
const NAMED_COLOURS = (
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet ' +
  'brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan ' +
  'darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta ' +
  'darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue ' +
  'darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey ' +
  'dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray ' +
  'green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush ' +
  'lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray ' +
  'lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
  'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon ' +
  'mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue ' +
  'mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin ' +
  'navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen ' +
  'paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple ' +
  'rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna ' +
  'silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle ' +
  'tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
).split(' ');
const COLOUR_WORD = new RegExp(`(?<![\\w-])(?:${NAMED_COLOURS.join('|')})(?![\\w-])`, 'gi');
/** A property whose value holds a colour, and the functions whose arguments do: a colour position. */
const COLOUR_PROP =
  /^(?:--.*|.*colou?r.*|background.*|border.*|outline.*|fill|stroke|.*shadow|text-decoration.*|column-rule.*|caret.*|accent.*|-webkit-text-stroke.*|-webkit-tap-highlight.*)$/;
const COLOUR_ARG_FN =
  /^(?:color-mix|(?:repeating-)?(?:linear|radial|conic)-gradient|drop-shadow|light-dark)$/;
const EASING =
  /(?<![\w-])(?:ease-in-out|ease-in|ease-out|ease|linear|step-start|step-end)(?![\w(-])/g;
const DURATION = /(?<![\w.#-])-?(?:\d*\.\d+|\d+)(?:ms|s)(?![\w-])/g;
const LENGTH =
  /(?<![\w.#-])-?(?:\d*\.\d+|\d+)(?:px|rem|em|ex|ch|vh|vw|dvh|dvw|svh|svw|lvh|lvw|vmin|vmax)(?![\w-])/g;
/** The line-height after the size in a `font` shorthand: `14px/1.4`, `12px/16px`. */
const FONT_LINE_HEIGHT = /(?<=\/\s*)(?:\d*\.\d+|\d+)(?:px|rem|em|%)?(?![\w.%-])/g;
const PERCENT = /(?<![\w.#-])-?(?:\d*\.\d+|\d+)%/g;
const UNITLESS = /(?<![\w.#-])-?(?:\d*\.\d+|\d+)(?![\w.%(-])/g;

/** The index of the `)` closing the `(` at `open`, or the text's end. */
function closeParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return text.length - 1;
}

/** For each index, the names of the functions (`calc`, `color-mix`, …) whose parentheses hold it. */
function functionStacks(text) {
  const stacks = new Array(text.length);
  const stack = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') {
      const name = /([\w-]*)$/.exec(text.slice(Math.max(0, i - 24), i))[1];
      stack.push(name);
      stacks[i] = stack.slice();
    } else if (text[i] === ')') {
      stacks[i] = stack.slice();
      stack.pop();
    } else {
      stacks[i] = stack.slice();
    }
  }
  return stacks;
}

/** `text` with every `@keyframes` block blanked, so its selectors and dash arrays are not read. */
function blankKeyframes(text) {
  let out = text;
  for (const m of text.matchAll(/@keyframes\b/g)) {
    const open = out.indexOf('{', m.index);
    let end = out.length;
    if (open !== -1) {
      let depth = 0;
      for (let i = open; i < out.length; i++) {
        if (out[i] === '{') depth++;
        else if (out[i] === '}' && --depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    out = out.slice(0, m.index) + ' '.repeat(end - m.index) + out.slice(end);
  }
  return out;
}

/**
 * The raw literals in one piece of CSS-ish text, as `{index, literal, kind}` with `index` into
 * `text`. `initialProp` is the property the text's start is a value of (a style-object key).
 */
export function scanCss(text, initialProp = null) {
  const found = [];
  let work = blankKeyframes(text);
  const blank = (from, to) => (work = work.slice(0, from) + ' '.repeat(to - from) + work.slice(to));
  for (const [re, kind] of [
    [COLOUR_FN, 'colour'],
    [BEZIER_FN, 'easing'],
  ]) {
    for (const m of [...work.matchAll(re)]) {
      const end = closeParen(work, m.index + m[0].length - 1) + 1;
      found.push({ index: m.index, literal: work.slice(m.index, end), kind });
      blank(m.index, end);
    }
  }
  const stacks = functionStacks(work);
  // Declarations: pieces between ; { and }, each `prop: value` unless a { follows (a selector).
  const pieceRe = /[^;{}]+/g;
  let first = true;
  for (const piece of work.matchAll(pieceRe)) {
    const start = piece.index;
    const after = work[start + piece[0].length];
    const decl = after === '{' ? null : /^\s*(-{0,2}[a-zA-Z][\w-]*)\s*:/.exec(piece[0]);
    let prop = null;
    let valueStart = start;
    if (decl) {
      prop = decl[1].toLowerCase();
      valueStart = start + decl[0].length;
    } else if (first && initialProp) {
      prop = initialProp;
    }
    first = false;
    const value = work.slice(valueStart, start + piece[0].length);
    const at = (m) => valueStart + m.index;
    const push = (m, kind) => found.push({ index: at(m), literal: m[0], kind });
    for (const m of value.matchAll(HEX)) push(m, 'colour');
    const colourProp = prop !== null && COLOUR_PROP.test(prop);
    for (const m of value.matchAll(COLOUR_WORD)) {
      if (colourProp || stacks[at(m)].some((fn) => COLOUR_ARG_FN.test(fn))) push(m, 'colour');
    }
    for (const m of value.matchAll(EASING)) push(m, 'easing');
    for (const m of value.matchAll(DURATION)) if (!isZero(m[0])) push(m, 'duration');
    const claimed = new Set();
    if (prop === 'font') {
      for (const m of value.matchAll(FONT_LINE_HEIGHT)) {
        claimed.add(m.index);
        if (!isZero(m[0])) push(m, 'line-height');
      }
    }
    const lengthKind = prop === 'letter-spacing' || prop === 'line-height' ? prop : 'size';
    for (const m of value.matchAll(LENGTH)) {
      if (!isZero(m[0]) && !claimed.has(m.index)) push(m, lengthKind);
    }
    for (const m of value.matchAll(PERCENT)) {
      if (isZero(m[0]) || m[0] === '100%' || claimed.has(m.index)) continue;
      if (prop && UNITLESS_PROPS.has(prop)) push(m, prop);
      else if (stacks[at(m)].includes('color-mix') || (prop && isBoxProp(prop))) push(m, 'percent');
    }
    if (prop && UNITLESS_PROPS.has(prop)) {
      for (const m of value.matchAll(UNITLESS)) {
        if (isZero(m[0]) || stacks[at(m)].includes('calc')) continue;
        push(m, prop);
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// JSX

const kebab = (key) =>
  key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^webkit-/, '-webkit-');

/** React style keys whose numbers React writes unitless and which the item does not cover. */
const UNCOVERED_NUMERIC_KEYS = new Set([
  'flex',
  'flexGrow',
  'flexShrink',
  'fontWeight',
  'order',
  'aspectRatio',
  'WebkitLineClamp',
  'lineClamp',
  'gridRow',
  'gridColumn',
  'columnCount',
  'tabIndex',
]);
const LENGTH_KEYS = new Set([
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'top',
  'left',
  'right',
  'bottom',
  'inset',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginInline',
  'marginBlock',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingInline',
  'paddingBlock',
  'gap',
  'rowGap',
  'columnGap',
  'fontSize',
  'borderRadius',
  'borderWidth',
  'outlineWidth',
  'outlineOffset',
  'flexBasis',
  'letterSpacing',
  'strokeWidth',
  'borderTopWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderRightWidth',
]);

/** Object keys whose numbers are counts, positions in a list or bounds, not sizes. */
const COUNT_KEYS = new Set([
  'index',
  'count',
  'rows',
  'columns',
  'cols',
  'span',
  'min',
  'max',
  'step',
  'steps',
  'length',
  'level',
  'page',
  'seed',
  'id',
  'key',
  'maxLines',
  'digits',
  'decimals',
  'precision',
]);

/**
 * The kind a number `value` takes as the value of object key `key`, or null when it is no literal.
 * A known style key counts any value. Any other key counts a value of magnitude 2 or more, of the
 * kind its name says or else a size: that catches size maps (`{sm: 32}`) and numeric style keys
 * outside the lists (`WebkitTextStroke: 2`). A 1 under an unknown key is left as a flag, count or
 * unit ratio; the unitless-allowed keys (`flexGrow`, `fontWeight`, ...) and count keys never count.
 */
function kindForObjectKey(key, value) {
  if (key === 'zIndex') return 'z-index';
  if (key === 'opacity') return 'opacity';
  if (key === 'lineHeight') return 'line-height';
  if (key === 'letterSpacing') return 'letter-spacing';
  if (UNCOVERED_NUMERIC_KEYS.has(key) || COUNT_KEYS.has(key)) return null;
  if (LENGTH_KEYS.has(key)) return 'size';
  return Math.abs(value) >= 2 ? (kindForName(key) ?? 'size') : null;
}

const SVG_TAGS = new Set([
  'svg',
  'circle',
  'ellipse',
  'rect',
  'path',
  'line',
  'polyline',
  'polygon',
  'g',
  'text',
  'tspan',
  'use',
  'mask',
  'clipPath',
  'pattern',
  'defs',
  'symbol',
  'linearGradient',
  'radialGradient',
  'stop',
]);
const SVG_GEOMETRY = new Set([
  'width',
  'height',
  'viewBox',
  'r',
  'rx',
  'ry',
  'cx',
  'cy',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'dx',
  'dy',
  'fx',
  'fy',
  'd',
  'points',
  'pathLength',
  'strokeWidth',
  'offset',
]);

/** True when JSX attribute `attr` is geometry on an SVG element: drawing, not layout. */
function isSvgGeometry(attr) {
  const el = attr.parent.parent;
  const tag = ts.isIdentifier(el.tagName) ? el.tagName.text : null;
  return SVG_TAGS.has(tag) && ts.isIdentifier(attr.name) && SVG_GEOMETRY.has(attr.name.text);
}

/** Calls whose result is one of their arguments: a bound in Math.min/max/clamp means what the result means. */
const isBoundCall = (call) => /^(?:Math\.(?:min|max)|clamp)$/.test(call.expression.getText());

/** The kind a number takes as the default or value of a binding or prop named `name`. */
function kindForName(name) {
  if (name === 'zIndex' || /zIndex$/.test(name)) return 'z-index';
  if (/opacity$/i.test(name)) return 'opacity';
  if (/(after|delay|ms|millis|duration|timeout|interval)$/i.test(name) || name === 'fade') {
    return 'duration';
  }
  if (/^(h|w|r)$/.test(name) || /At$/.test(name)) return 'size';
  if (
    /(size|width|height|thickness|radius|pad|padding|inset|gap|margin|offset|thumb|threshold|spacing|elevation)$/i.test(
      name,
    )
  ) {
    return 'size';
  }
  return null;
}

const propName = (name) =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) ? name.text : null;

const isStringy = (n) =>
  ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n);
const isPlus = (n) => ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken;

/** True when a `+` chain holds a string somewhere, so it is CSS text, not arithmetic. */
function plusHasString(n) {
  if (isStringy(n)) return true;
  if (ts.isParenthesizedExpression(n)) return plusHasString(n.expression);
  if (isPlus(n)) return plusHasString(n.left) || plusHasString(n.right);
  return false;
}

/** True when `node` is a piece of a larger CSS text (a `+` operand, a `${}`, a branch of one). */
function isChainPart(node) {
  const p = node.parent;
  if (isPlus(p) && plusHasString(p)) return true;
  if (ts.isTemplateSpan(p)) return true;
  if (ts.isParenthesizedExpression(p)) return isChainPart(p);
  if (ts.isConditionalExpression(p) && p.condition !== node) return isChainPart(p);
  return false;
}

/** The style property a CSS text is the value of: the key of the object property holding it. */
function styleContext(node) {
  let n = node;
  for (;;) {
    const p = n.parent;
    if (ts.isParenthesizedExpression(p) || (ts.isConditionalExpression(p) && p.condition !== n))
      n = p;
    else if (
      ts.isBinaryExpression(p) &&
      [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(
        p.operatorToken.kind,
      )
    )
      n = p;
    else break;
  }
  let p = n.parent;
  if (ts.isPropertyAssignment(p) && p.initializer === n) {
    const key = propName(p.name);
    return key ? kebab(key) : null;
  }
  if (ts.isJsxExpression(p)) p = p.parent;
  if (ts.isJsxAttribute(p) && ts.isIdentifier(p.name) && !isSvgGeometry(p)) {
    return kebab(p.name.text);
  }
  return null;
}

/**
 * A CSS text as slots: `{seg}` a literal piece (text plus its source offset), `{alt}` a choice
 * between sub-texts (a conditional), or `{hole}` a value the source computes.
 */
function flatten(node, sf) {
  if (ts.isParenthesizedExpression(node)) return flatten(node.expression, sf);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return [{ seg: node.text, pos: node.getStart(sf) + 1 }];
  }
  if (ts.isNumericLiteral(node)) return [{ seg: node.getText(sf), pos: node.getStart(sf) }];
  if (ts.isTemplateExpression(node)) {
    const slots = [{ seg: node.head.text, pos: node.head.getStart(sf) + 1 }];
    for (const span of node.templateSpans) {
      slots.push(...flatten(span.expression, sf));
      slots.push({ seg: span.literal.text, pos: span.literal.getStart(sf) + 1 });
    }
    return slots;
  }
  if (isPlus(node)) return [...flatten(node.left, sf), ...flatten(node.right, sf)];
  if (ts.isConditionalExpression(node)) {
    return [{ alt: [flatten(node.whenTrue, sf), flatten(node.whenFalse, sf)] }];
  }
  return [{ hole: true }];
}

/** Every reading of a slot list: holes and choices left open, then each choice taken in turn. */
function* readings(slots) {
  const open = slots.map((s) => (s.alt ? { hole: true } : s));
  yield open;
  for (let i = 0; i < slots.length; i++) {
    if (!slots[i].alt) continue;
    for (const option of slots[i].alt) {
      for (const r of readings(option)) yield [...open.slice(0, i), ...r, ...open.slice(i + 1)];
    }
  }
}

/** A reading joined into text, with the source offset of each character (null for a hole). */
function joinReading(reading) {
  let text = '';
  const pos = [];
  for (const s of reading) {
    if (s.hole) {
      text += '§';
      pos.push(null);
    } else {
      text += s.seg;
      for (let i = 0; i < s.seg.length; i++) pos.push(s.pos + i);
    }
  }
  return { text, pos };
}

/** The kind of a token, from its name: what a literal fallback beside it stands in for. */
function tokenKind(name) {
  if (/^--(duration|motion)/.test(name)) return 'duration';
  if (/^--z-/.test(name)) return 'z-index';
  if (/^--(opacity|state-layer)/.test(name)) return 'opacity';
  if (/^--line-height/.test(name)) return 'line-height';
  if (/^--(tracking|letter-spacing)/.test(name)) return 'letter-spacing';
  return 'size';
}

/** The first token name (a string starting `--`) written inside `node`, or null. */
function tokenIn(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return /^--[\w-]+$/.test(node.text) ? node.text : null;
  }
  return ts.forEachChild(node, tokenIn) ?? null;
}

/** Local helpers' parameter names, by helper name: `const f = (a, size) => …`, `function f(…)`. */
function localHelpers(sf) {
  const helpers = new Map();
  const params = (fn) => fn.parameters.map((p) => (ts.isIdentifier(p.name) ? p.name.text : null));
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) helpers.set(node.name.text, params(node));
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      helpers.set(node.name.text, params(node.initializer));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return helpers;
}

/** The name a value is bound to: a variable, parameter or binding default, or an object key. */
function bindingName(node) {
  const p = node.parent;
  if (
    (ts.isBindingElement(p) || ts.isParameter(p) || ts.isVariableDeclaration(p)) &&
    p.initializer === node &&
    ts.isIdentifier(p.name)
  ) {
    return p.name.text;
  }
  if (ts.isPropertyAssignment(p) && p.initializer === node) return propName(p.name);
  return null;
}

const isNumberLike = (e) =>
  ts.isNumericLiteral(e) || (ts.isPrefixUnaryExpression(e) && ts.isNumericLiteral(e.operand));

/**
 * Walks a number up to what gives it meaning; returns its kind, or null when it is no literal.
 * An array made only of numbers is a ramp: each element of magnitude 2 or more counts, of the
 * kind its binding's name says or else a size (`[24, 48]`); a 1 is left as a flag or ratio.
 */
function numberKind(node, helpers) {
  const value = Number(node.text);
  let n = node;
  for (;;) {
    const p = n.parent;
    if (ts.isArrayLiteralExpression(p)) {
      if (!p.elements.every(isNumberLike) || Math.abs(value) < 2) return null;
      const name = bindingName(p);
      return (name && kindForName(name)) ?? 'size';
    }
    if (ts.isCallExpression(p) && p.arguments.includes(n) && isBoundCall(p)) n = p;
    else if (ts.isParenthesizedExpression(p)) n = p;
    else if (ts.isPrefixUnaryExpression(p)) n = p;
    else if (ts.isConditionalExpression(p)) {
      if (p.condition === n) return null;
      n = p;
    } else if (ts.isBinaryExpression(p)) {
      const op = p.operatorToken.kind;
      if (op === ts.SyntaxKind.PlusToken && plusHasString(p)) return null; // read as CSS text
      const fallback = [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(
        op,
      );
      if (fallback && p.right === n && tokenIn(p.left)) return tokenKind(tokenIn(p.left));
      if (
        ![
          ts.SyntaxKind.PlusToken,
          ts.SyntaxKind.MinusToken,
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(op)
      )
        return null;
      n = p;
    } else break;
  }
  const p = n.parent;
  if (ts.isTemplateSpan(p)) return null;
  if (ts.isPropertyAssignment(p) && p.initializer === n) {
    const key = propName(p.name);
    return key ? kindForObjectKey(key, value) : null;
  }
  if (
    (ts.isBindingElement(p) || ts.isParameter(p) || ts.isVariableDeclaration(p)) &&
    p.initializer === n
  ) {
    return ts.isIdentifier(p.name) ? kindForName(p.name.text) : null;
  }
  if (ts.isCallExpression(p) && p.arguments.includes(n)) {
    const index = p.arguments.indexOf(n);
    const callee = ts.isPropertyAccessExpression(p.expression) ? p.expression.name : p.expression;
    const name = ts.isIdentifier(callee) ? callee.text : null;
    if (name && /^set(Timeout|Interval)$/.test(name)) return index === 1 ? 'duration' : null;
    const token = p.arguments.map((a) => (a === n ? null : tokenIn(a))).find(Boolean);
    if (token) return tokenKind(token);
    const param = ts.isIdentifier(p.expression) ? helpers.get(name)?.[index] : null;
    return param ? kindForName(param) : null;
  }
  if (ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent)) {
    const name = p.parent.name;
    if (isSvgGeometry(p.parent)) return null;
    return ts.isIdentifier(name) ? kindForName(name.text) : null;
  }
  return null;
}

/** The raw literals in one Sonora JSX source, as `{file, line, literal, kind}` in source order. */
export function scanJsx(source, file) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const helpers = localHelpers(sf);
  const byKey = new Map();
  const add = (pos, literal, kind) => {
    const key = `${pos}:${literal}`;
    if (!byKey.has(key)) byKey.set(key, { pos, literal, kind });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    const cssRoot =
      (isStringy(node) || (isPlus(node) && plusHasString(node))) && !isChainPart(node);
    if (cssRoot) {
      const initialProp = styleContext(node);
      for (const reading of readings(flatten(node, sf))) {
        const { text, pos } = joinReading(reading);
        for (const f of scanCss(text, initialProp)) {
          const at = pos.slice(f.index, f.index + f.literal.length).find((p) => p !== null);
          if (at !== undefined) add(at, f.literal, f.kind);
        }
      }
      return; // its pieces are read with it
    }
    if (ts.isNumericLiteral(node) && !isZero(node.text)) {
      const kind = numberKind(node, helpers);
      if (kind) add(node.getStart(sf), node.getText(sf), kind);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return [...byKey.values()]
    .sort((a, b) => a.pos - b.pos)
    .map(({ pos, literal, kind }) => ({
      file,
      line: sf.getLineAndCharacterOfPosition(pos).line + 1,
      literal,
      kind,
    }));
}

// ---------------------------------------------------------------------------------------------
// Kotlin

const KOTLIN_NUMBER = String.raw`\d*\.?\d+f?`;
const KOTLIN_RULES = [
  [new RegExp(String.raw`(?<![\w.])(\d+(?:\.\d+)?f?)\.(?:dp|sp|em)\b`, 'g'), 'size'],
  [new RegExp(String.raw`\(\s*(${KOTLIN_NUMBER})\s*\)\.(?:dp|sp|em)\b`, 'g'), 'size'],
  [new RegExp(String.raw`\bDp\(\s*(${KOTLIN_NUMBER})\s*\)`, 'g'), 'size'],
  [/\bColor\(\s*0x[0-9A-Fa-f_]+[uUL]*\s*\)/g, 'colour'],
  [new RegExp(String.raw`(?<![\w.])alpha\s*=\s*(${KOTLIN_NUMBER})`, 'g'), 'opacity'],
  [new RegExp(String.raw`\.alpha\(\s*(${KOTLIN_NUMBER})`, 'g'), 'opacity'],
  [/\btween(?:<[^>()]*>)?\(\s*(\d+)/g, 'duration'],
  [/\b(?:durationMillis|delayMillis)\s*=\s*(\d+)/g, 'duration'],
  [new RegExp(String.raw`\b(?:stiffness|dampingRatio)\s*=\s*(${KOTLIN_NUMBER})`, 'g'), 'easing'],
  [new RegExp(String.raw`\bzIndex\(\s*(${KOTLIN_NUMBER})`, 'g'), 'z-index'],
];

/** A size in a `letterSpacing =` or `lineHeight =` argument takes that kind instead. */
function kotlinKind(text, index, kind) {
  if (kind !== 'size') return kind;
  const arg = /\b(letterSpacing|lineHeight)\s*=\s*\(?\s*$/.exec(
    text.slice(Math.max(0, index - 40), index),
  );
  if (!arg) return kind;
  return arg[1] === 'letterSpacing' ? 'letter-spacing' : 'line-height';
}

/** `source` with its comments blanked, line breaks kept. */
const stripKotlinComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (c) => c.replace(/[^\n]/g, ' '));

/** The raw literals in one ui/sonora Kotlin source, as `{file, line, literal, kind}`. */
export function scanKotlin(source, file) {
  const text = stripKotlinComments(source);
  const found = [];
  for (const [re, kind] of KOTLIN_RULES) {
    for (const m of text.matchAll(re)) {
      if (m[1] !== undefined && isZero(m[1])) continue;
      found.push({ index: m.index, literal: m[0], kind: kotlinKind(text, m.index, kind) });
    }
  }
  return found
    .sort((a, b) => a.index - b.index)
    .map(({ index, literal, kind }) => ({
      file,
      line: text.slice(0, index).split('\n').length,
      literal,
      kind,
    }));
}

// ---------------------------------------------------------------------------------------------
// The repo

/** Files under `dir` (repo-relative) ending in `ext`, skipping any `generated` folder. */
function walk(root, dir, ext) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const name of readdirSync(abs).sort()) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) {
      if (name !== 'generated') out.push(...walk(root, rel, ext));
    } else if (name.endsWith(ext)) out.push(rel);
  }
  return out;
}

/** Every raw literal in the repo at `root`, allowlisted or not. */
export function scanRepo(root) {
  const jsx = walk(root, JSX_DIR, '.jsx').flatMap((f) =>
    scanJsx(readFileSync(join(root, f), 'utf8'), f),
  );
  const kt = walk(root, KOTLIN_DIR, '.kt').flatMap((f) =>
    scanKotlin(readFileSync(join(root, f), 'utf8'), f),
  );
  return [...jsx, ...kt];
}

/**
 * The check: findings past the allowlist, and allowlist entries matching nothing (stale).
 * `ok` holds when both are empty.
 */
export function checkLiterals(root) {
  const allowPath = join(root, ALLOWLIST_FILE);
  const allow = existsSync(allowPath)
    ? parseAllowlist(JSON.parse(readFileSync(allowPath, 'utf8')))
    : [];
  const all = scanRepo(root);
  const listed = (f) => allow.some((a) => a.file === f.file && a.literal === f.literal);
  const findings = all.filter((f) => !listed(f));
  const stale = allow.filter((a) => !all.some((f) => f.file === a.file && f.literal === a.literal));
  return {
    findings,
    stale,
    allowed: all.length - findings.length,
    ok: findings.length === 0 && stale.length === 0,
  };
}

const countBy = (items, key) => {
  const counts = new Map();
  for (const i of items) counts.set(i[key], (counts.get(i[key]) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
};

/** The report: counts per file and per kind, then the total. */
export function formatReport({ findings, stale, allowed }) {
  const lines = ['Sonora raw literals (report mode; the check does not fail yet)', '', 'By file:'];
  const pad = (rows) => Math.max(0, ...rows.map(([k]) => String(k).length)) + 2;
  const files = countBy(findings, 'file');
  for (const [f, n] of files) lines.push(`  ${f.padEnd(pad(files))}${n}`);
  lines.push('', 'By kind:');
  const kinds = countBy(findings, 'kind');
  for (const [k, n] of kinds) lines.push(`  ${k.padEnd(pad(kinds))}${n}`);
  lines.push('', `allowlisted ${allowed}`, `stale allowlist entries ${stale.length}`);
  for (const s of stale) lines.push(`  ${s.file} ${s.literal}`);
  lines.push(`total ${findings.length}`);
  return lines.join('\n');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { values } = parseArgs({
    options: { report: { type: 'boolean', default: false }, root: { type: 'string' } },
  });
  const root = values.root ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const result = checkLiterals(root);
  if (values.report) {
    console.log(formatReport(result));
  } else {
    for (const f of result.findings) console.error(`${f.file}:${f.line} ${f.kind} ${f.literal}`);
    for (const s of result.stale)
      console.error(`${ALLOWLIST_FILE}: ${s.file} ${s.literal} matches nothing`);
    if (!result.ok) {
      console.error(
        `\n${result.findings.length} raw literal(s), ${result.stale.length} stale allowlist entr(ies). Use a token.`,
      );
      process.exit(1);
    }
  }
}
