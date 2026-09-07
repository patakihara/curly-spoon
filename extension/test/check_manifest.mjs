/**
 * Real check for extension/lib/manifest.js (work order 1.3's tree).
 *
 * Order 1.3's stated check was "sonora-ctl.js listCards returns all 84 cards
 * grouped correctly", which needs a live VS Code window answering the loopback
 * endpoint. lib/manifest.js is deliberately vscode-free, so the grouping half
 * of that check is verifiable headlessly — this script does that against the
 * real _ds_manifest.json in the checkout, never a fixture.
 *
 *   ~/.local/share/node22/bin/node extension/test/check_manifest.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const manifest = require(path.join(ROOT, 'extension/lib/manifest.js'));

const fails = [];
function ok(cond, label, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);
  if (!cond) fails.push(label);
}

const ds = manifest.loadManifest(path.join(ROOT, '_ds_manifest.json'));

ok(Array.isArray(ds.cardGroups), 'loadManifest returns cardGroups');
ok(Array.isArray(ds.tokenGroups), 'loadManifest returns tokenGroups');

const cards = ds.cardGroups.flatMap((g) => g.cards);
ok(cards.length === 84, 'every card is grouped', `${cards.length} cards in ${ds.cardGroups.length} groups`);
ok(ds.cardGroups.length === 8, 'group count matches gen_gallery.py', `${ds.cardGroups.length} groups`);

// gen_gallery.py reports "84 cards across 8 groups"; the tree must not invent,
// drop or duplicate a card relative to the manifest's own card list.
const raw = ds.raw.cards || [];
ok(raw.length === cards.length, 'no card lost or duplicated by grouping', `${raw.length} raw vs ${cards.length} grouped`);
const paths = new Set(cards.map((c) => c.path));
ok(paths.size === cards.length, 'card paths are unique');

ok(ds.cardGroups.every((g) => typeof g.group === 'string' && g.group), 'every card group is named',
  ds.cardGroups.map((g) => `${g.group}(${g.cards.length})`).join(', '));
ok(cards.every((c) => c.path && c.name), 'every card has a path and a name');
ok(ds.cardGroups.every((g) => g.cards.every((c) => c.group === g.group)), 'each card sits under its own declared group');

const tokens = ds.tokenGroups.flatMap((g) => g.tokens);
ok(tokens.length > 0, 'tokens are grouped', `${tokens.length} tokens in ${ds.tokenGroups.length} kinds`);
ok(ds.tokenGroups.every((g) => typeof g.kind === 'string' && g.kind), 'every token group is a named kind',
  ds.tokenGroups.map((g) => `${g.kind}(${g.tokens.length})`).join(', '));
ok(tokens.every((t) => t.name && t.value !== undefined), 'every token has a name and a value');
ok(ds.tokenGroups.every((g) => g.tokens.every((t) => t.kind === g.kind)), 'each token sits under its own declared kind');

// The Tokens tree draws a swatch for colour tokens, so they must carry a value
// a CSS colour parser can use.
const colors = (ds.tokenGroups.find((g) => g.kind === 'color') || { tokens: [] }).tokens;
ok(colors.length > 0, 'a colour kind exists for the swatch icons', `${colors.length} colour tokens`);

// Not every colour token is a literal: aliases (`var(--state-success)`) and the one
// gradient must resolve to a paintable literal or to null, never be inlined verbatim
// into an SVG fill, which would paint a black square that lies about the colour.
const literals = colors.filter((t) => /^(#|rgb|hsl)/i.test(String(t.value).trim()));
const aliases = colors.filter((t) => /^var\(/.test(String(t.value).trim()));
ok(aliases.length > 0, 'the manifest really does contain alias colours', `${aliases.length} aliases, ${literals.length} literals`);
ok(literals.every((t) => manifest.resolveColor(t.value, ds.tokenIndex) === String(t.value).trim()),
  'a literal colour resolves to itself');
ok(aliases.every((t) => {
  const paint = manifest.resolveColor(t.value, ds.tokenIndex);
  return paint === null || /^(#|rgb|hsl)/i.test(paint);
}), 'every alias resolves to a literal colour or to no swatch at all');
const unresolved = aliases.filter((t) => manifest.resolveColor(t.value, ds.tokenIndex) === null);
ok(unresolved.length === 0, 'every alias in this manifest resolves to a real colour',
  unresolved.length ? unresolved.map((t) => t.name).join(', ') : `all ${aliases.length} aliases resolved`);
ok(manifest.resolveColor('linear-gradient(transparent 0%, rgb(0 0 0 / 85%) 100%)', ds.tokenIndex) === null,
  'a gradient yields no swatch rather than a broken fill');
ok(manifest.resolveColor('var(--does-not-exist)', ds.tokenIndex) === null, 'an unknown alias yields no swatch');
ok(manifest.resolveColor('var(--does-not-exist, #abcdef)', ds.tokenIndex) === '#abcdef', 'a var() fallback is honoured');

console.log(fails.length ? `\n${fails.length} check(s) failed.` : '\nAll checks passed.');
process.exit(fails.length ? 1 : 0);
