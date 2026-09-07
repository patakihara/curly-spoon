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

/** Read + group in one call — what extension.js's tree providers and the loopback
 * `listCards` tool both want. */
function loadManifest(manifestPath) {
  const manifest = readManifest(manifestPath);
  return {
    cardGroups: groupCards(manifest.cards),
    tokenGroups: groupTokens(manifest.tokens),
    raw: manifest,
  };
}

module.exports = { readManifest, groupCards, groupTokens, loadManifest };
