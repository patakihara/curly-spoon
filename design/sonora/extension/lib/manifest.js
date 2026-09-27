'use strict';
/**
 * Sonora Design — vscode-free `_ds_manifest.json` reader (docs/EXTENSION-PLAN.md §4 "1.3").
 *
 * Mirrors lib/server.js and lib/discovery.js's split: no `require('vscode')` here, so this
 * module can be `node --check`'d and exercised from a scratch script directly (the work
 * order's own verification step). extension.js requires it and layers the vscode-facing
 * TreeDataProviders on top.
 *
 * `_ds_manifest.json` keys used here: `cards[]` ({path, group, name, subtitle, viewport})
 * and `tokens[]` ({name, value, kind, definedIn}) — docs/EXTENSION-PLAN.md §3's manifest
 * facts, plus the queue item's own key list.
 */
const fs = require('fs');

/** Parse the manifest file at `manifestPath`. Throws on a missing/unparsable file — the
 * caller (extension.js) decides how to surface that (an empty tree + a logged error). */
function readManifest(manifestPath) {
  const raw = fs.readFileSync(manifestPath, 'utf8');
  return JSON.parse(raw);
}

/** Group `cards` by their `group` field, first-seen order (not alphabetical — matches the
 * order docs/gen_gallery.py already renders groups in, per EXTENSION-PLAN.md §1 row B1). */
function groupCards(cards) {
  const order = [];
  const byGroup = new Map();
  for (const card of cards || []) {
    const group = card.group || '';
    if (!byGroup.has(group)) {
      byGroup.set(group, []);
      order.push(group);
    }
    byGroup.get(group).push(card);
  }
  return order.map((group) => ({ group, cards: byGroup.get(group) }));
}

/** Group `tokens` by their `kind` field, first-seen order. */
function groupTokens(tokens) {
  const order = [];
  const byKind = new Map();
  for (const token of tokens || []) {
    const kind = token.kind || '';
    if (!byKind.has(kind)) {
      byKind.set(kind, []);
      order.push(kind);
    }
    byKind.get(kind).push(token);
  }
  return order.map((kind) => ({ kind, tokens: byKind.get(kind) }));
}

/** Index `tokens` by name, so a `var(--x)` alias can be followed to a real value. */
function indexTokens(tokens) {
  const byName = new Map();
  for (const token of tokens || []) {
    if (token && token.name && !byName.has(token.name)) byName.set(token.name, token.value);
  }
  return byName;
}

/** Resolve a colour token's value to something a renderer can actually paint.
 *
 * 20 of this repo's 106 colour tokens are not literal colours: most are aliases
 * (`--tone-library: var(--state-success)`) and one is a gradient
 * (`--surface-overlay-header`). Inlining those verbatim into an SVG `fill=` paints
 * nothing — SVG has no access to the CSS custom properties they name — so the Tokens
 * tree would show a black or empty swatch and quietly lie about the colour. Follow
 * alias chains to a literal; return null when there is nothing paintable, and let the
 * caller show no swatch rather than a wrong one.
 *
 * `var(--x, fallback)` uses the fallback when `--x` is unknown, as CSS does. */
function resolveColor(value, byName, depth = 0) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw || depth > 8) return null;

  const alias = /^var\(\s*(--[\w-]+)\s*(?:,([\s\S]*))?\)$/.exec(raw);
  if (alias) {
    const [, name, fallback] = alias;
    if (byName && byName.has(name)) {
      const resolved = resolveColor(byName.get(name), byName, depth + 1);
      if (resolved) return resolved;
    }
    return fallback ? resolveColor(fallback, byName, depth + 1) : null;
  }

  // Literal colours only: a gradient or any other <image> value is not a swatch.
  if (/^(#|rgb\(|rgba\(|hsl\(|hsla\(|color\()/i.test(raw)) return raw;
  if (/^[a-z]+$/i.test(raw)) return raw; // named CSS colour (currentColor, rebeccapurple, …)
  return null;
}

/** Read + group in one call — what extension.js's tree providers and the loopback
 * `listCards` tool both want. */
function loadManifest(manifestPath) {
  const manifest = readManifest(manifestPath);
  return {
    cardGroups: groupCards(manifest.cards),
    tokenGroups: groupTokens(manifest.tokens),
    tokenIndex: indexTokens(manifest.tokens),
    raw: manifest,
  };
}

module.exports = { readManifest, groupCards, groupTokens, indexTokens, resolveColor, loadManifest };
