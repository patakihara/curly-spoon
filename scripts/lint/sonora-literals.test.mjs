/**
 * Sonora hard-codes nothing: every size, colour, opacity, duration, easing, z-index, line-height
 * and letter-spacing in its components and in Android's ui/sonora is a token, past one allowlist.
 * Run: node --test scripts/lint/sonora-literals.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from '../plan/testing.mjs';
import {
  ALLOWLIST_FILE,
  KOTLIN_DIR,
  checkLiterals,
  parseAllowlist,
  scanJsx,
  scanKotlin,
} from './sonora-literals.mjs';

const CLI = join(REPO_ROOT, 'scripts/lint/sonora-literals.mjs');
const TOKENS_KT =
  'android/sonora/src/main/java/net/develivarr/auralis/generated/theme/SonoraTokens.kt';

/** A temp copy of everything the check reads: Sonora's components and tokens, ui/sonora, the allowlist. */
function repoCopy() {
  const root = mkdtempSync(join(tmpdir(), 'sonora-literals-'));
  for (const dir of [
    'design/sonora/components',
    'design/sonora/tokens',
    'design/sonora/export',
    KOTLIN_DIR,
    TOKENS_KT,
    ALLOWLIST_FILE,
  ]) {
    cpSync(join(REPO_ROOT, dir), join(root, dir), { recursive: true });
  }
  return root;
}

const plant = (root, file, text) => writeFileSync(join(root, file), text);
const at = (findings, file) => findings.filter((f) => f.file === file).map((f) => f.literal);
const literals = (findings) => findings.map((f) => `${f.kind} ${f.literal}`);

test('[M0.sonoraclean/a] an unlisted width:13px planted in a Sonora sx string fails the check', () => {
  const root = repoCopy();
  const file = 'design/sonora/components/basic/Planted.jsx';
  plant(
    root,
    file,
    "export function Planted() { return <div style={sx('display:flex;width:13px')} />; }\n",
  );
  const result = checkLiterals(root);
  assert.deepEqual(at(result.findings, file), ['13px']);
  assert.equal(result.ok, false);
});

test('[M0.sonoraclean/a] an unlisted width:13px planted in a Sonora component’s injected CSS fails the check', () => {
  const root = repoCopy();
  const file = 'design/sonora/components/layouts/Planted.jsx';
  plant(
    root,
    file,
    [
      'const css = `.sn-planted { display: block; width: 13px; }`;',
      "export function Planted() { const s = document.createElement('style'); s.textContent = css; return null; }",
      '',
    ].join('\n'),
  );
  const result = checkLiterals(root);
  assert.deepEqual(at(result.findings, file), ['13px']);
  assert.equal(result.ok, false);
});

test('[M0.sonoraclean/a] an unlisted 12.dp planted in ui/sonora Kotlin fails the check', () => {
  const root = repoCopy();
  const file = `${KOTLIN_DIR}/Planted.kt`;
  plant(root, file, 'package x\n\nval Gap = 12.dp\n');
  const result = checkLiterals(root);
  assert.deepEqual(at(result.findings, file), ['12.dp']);
  assert.equal(result.ok, false);
});

test('[M0.sonoraclean/a] an allowlist entry matching nothing fails the check', () => {
  const root = repoCopy();
  const entry = {
    file: 'design/sonora/components/basic/IconButton.jsx',
    literal: '9999px',
    reason: 'Planted: matches nothing.',
  };
  const allow = parseAllowlist(JSON.parse(readFileSync(join(root, ALLOWLIST_FILE), 'utf8')));
  writeFileSync(join(root, ALLOWLIST_FILE), JSON.stringify([...allow, entry], null, 2));
  const result = checkLiterals(root);
  assert.deepEqual(result.stale, [entry]);
  assert.equal(result.ok, false);
});

test('[M0.sonoraclean/a] 0, 100% and the generated token files pass the check', () => {
  const root = repoCopy();
  const file = 'design/sonora/components/basic/Zeroes.jsx';
  plant(
    root,
    file,
    [
      "const css = '.sn-z { margin: 0; padding: 0px; width: 100%; transition-delay: 0ms; }';",
      'export function Zeroes() {',
      "  return <div style={{ ...sx('inset:0;height:100%;opacity:0'), margin: 0, zIndex: 0 }} />;",
      '}',
      '',
    ].join('\n'),
  );
  appendFileSync(join(root, 'design/sonora/tokens/spacing.css'), ':root { --planted: 13px; }\n');
  appendFileSync(
    join(root, 'design/sonora/export/web/sonora-tokens.css'),
    ':root { --planted: 13px; }\n',
  );
  appendFileSync(join(root, TOKENS_KT), '\nval Planted = 13.dp\n');
  const findings = checkLiterals(root).findings;
  assert.deepEqual(at(findings, file), []);
  assert.deepEqual(
    findings.filter((f) => /\/tokens\/|\/export\/|\/generated\//.test(f.file)),
    [],
  );
});

test('[M0.sonoraclean/a] every allowlist entry names a file, a literal and a reason', () => {
  const committed = JSON.parse(readFileSync(join(REPO_ROOT, ALLOWLIST_FILE), 'utf8'));
  assert.doesNotThrow(() => parseAllowlist(committed));
  for (const missing of ['file', 'literal', 'reason']) {
    const entry = { file: 'a.jsx', literal: '1px', reason: 'Because.' };
    delete entry[missing];
    assert.throws(() => parseAllowlist([entry]), new RegExp(missing));
  }
  assert.throws(() => parseAllowlist([{ file: 'a.jsx', literal: '1px', reason: '' }]), /reason/);
});

test('the report prints counts per file and per kind and exits 0, while the check exits 1', () => {
  const root = repoCopy();
  plant(root, 'design/sonora/components/basic/Planted.jsx', "const s = sx('width:13px');\n");
  const report = execFileSync('node', [CLI, '--report', '--root', root], { encoding: 'utf8' });
  assert.match(report, /design\/sonora\/components\/basic\/Planted\.jsx\s+1\b/);
  assert.match(report, /^\s*size\s+\d+/m);
  assert.match(report, /^total\s+\d+/m);
  const check = spawnSync('node', [CLI, '--root', root], { encoding: 'utf8' });
  assert.equal(check.status, 1);
  assert.match(check.stderr, /Planted\.jsx:1 size 13px/);
});

test('lengths, colours, durations and easing are found in any string', () => {
  const src = [
    "const a = sx('padding:6px 1.5rem;letter-spacing:.1em;color:#fff;background:rgb(0 0 0 / 40%)');",
    "const b = 'border: 1px solid white; box-shadow: 0 2px 4px black;';",
    "const c = 'transition: opacity 120ms ease-out, transform .28s cubic-bezier(.2,0,0,1)';",
    "const d = 'animation: spin 1s linear infinite';",
  ].join('\n');
  assert.deepEqual(literals(scanJsx(src, 'X.jsx')), [
    'size 6px',
    'size 1.5rem',
    'letter-spacing .1em',
    'colour #fff',
    'colour rgb(0 0 0 / 40%)',
    'size 1px',
    'colour white',
    'size 2px',
    'size 4px',
    'colour black',
    'duration 120ms',
    'easing ease-out',
    'duration .28s',
    'easing cubic-bezier(.2,0,0,1)',
    'duration 1s',
    'easing linear',
  ]);
});

test('token names, var() reads, calc ratios and linear-gradient are not literals', () => {
  const src = [
    "const a = sx('width:var(--art-2xl);gap:var(--spacing-2xs);transition:color var(--duration-fast) var(--ease-standard)');",
    "const b = sx('left:calc(-1 * var(--grid-margin) / 2);font-size:calc(var(--icon-sm) * .34)');",
    "const c = sx('background:linear-gradient(to bottom, var(--scrim), transparent);color:currentColor');",
    "const d = sx('line-height:calc(var(--leading) * 1.2)');",
  ].join('\n');
  assert.deepEqual(literals(scanJsx(src, 'X.jsx')), []);
});

test('unitless z-index, opacity and line-height are found by their property', () => {
  const src = [
    "const a = sx('position:absolute;z-index:2;opacity:0.72;line-height:1.2');",
    "const b = { zIndex: 30, opacity: open ? 1 : 0, lineHeight: '1.25', flexGrow: 1, fontWeight: 600 };",
  ].join('\n');
  assert.deepEqual(literals(scanJsx(src, 'X.jsx')), [
    'z-index 2',
    'opacity 0.72',
    'line-height 1.2',
    'z-index 30',
    'opacity 1',
    'line-height 1.25',
  ]);
});

test('a percentage counts on box and position properties and inside color-mix, not in a transform', () => {
  const src = [
    "const a = sx('top:38%;width:76%;border-radius:50%;max-height:80%;transform:translateY(-50%)');",
    "const b = sx('background:color-mix(in oklab, var(--accent) 16%, transparent)');",
  ].join('\n');
  assert.deepEqual(literals(scanJsx(src, 'X.jsx')), [
    'percent 38%',
    'percent 76%',
    'percent 50%',
    'percent 80%',
    'percent 16%',
  ]);
});

test('a value is read through string concatenation, conditionals and template chunks', () => {
  const src = [
    "const a = sx('opacity:' + (shown ? '0.72' : '0') + ';z-index:' + (top ? 3 : 2));",
    'const b = sx(`width:${w};height:${big ? 40 : 32}px;margin:${m}`);',
  ].join('\n');
  assert.deepEqual(literals(scanJsx(src, 'X.jsx')), [
    'opacity 0.72',
    'z-index 3',
    'z-index 2',
    'size 40px',
    'size 32px',
  ]);
});

test('keyframes bodies and selectors are geometry, not literals', () => {
  const src =
    "const css = '@keyframes sn-spin { 0% { stroke-dasharray: 1px 200px; } 50% { stroke-dasharray: 100px 200px; } } .sn-r { animation: sn-spin var(--duration-spin) var(--ease-linear) infinite; width: 13px; }';";
  assert.deepEqual(literals(scanJsx(src, 'X.jsx')), ['size 13px']);
});

test('numbers in style objects, size-named defaults, JSX size props and timer delays are found', () => {
  const src = [
    'export function A({ size = 36, step = 2, hideAfter = 900, progress = 0, value = 0.3 }) {',
    '  const h = mobile ? 36 : 32, half = h / 2, pad = 24, count = 3;',
    '  setTimeout(() => done(), 220);',
    '  setTimeout(() => done(), hideAfter);',
    '  return <div style={{ width: size + 8, height: h * 2, padding: 12, flex: 1 }}><B size={28} index={4} /></div>;',
    '}',
  ].join('\n');
  assert.deepEqual(literals(scanJsx(src, 'X.jsx')), [
    'size 36',
    'duration 900',
    'size 36',
    'size 32',
    'size 24',
    'duration 220',
    'size 8',
    'size 12',
    'size 28',
  ]);
});

test('a number passed to a local helper’s size- or timing-named parameter is found', () => {
  const src = [
    'const iconBtn = (color, size = 36, dim = false) => ({ width: size });',
    'function later(fn, ms) { return fn; }',
    "const a = iconBtn('var(--fg)', 44, true);",
    'const b = later(() => null, fade + 30);',
    'const c = Math.round(width / 3);',
  ].join('\n');
  assert.deepEqual(literals(scanJsx(src, 'X.jsx')), ['size 36', 'size 44', 'duration 30']);
});

test('a literal fallback beside a token name is found, of the token’s kind', () => {
  const src = [
    "const grow = tokenDuration(host, '--duration-medium', 280);",
    "const reach = (parseFloat(css.getPropertyValue('--focus-ring-width')) || 3) + 1;",
    "const layer = readToken('--z-menu') ?? 20;",
  ].join('\n');
  assert.deepEqual(literals(scanJsx(src, 'X.jsx')), ['duration 280', 'size 3', 'z-index 20']);
});

test('ordinary text is not read as a literal', () => {
  const src = [
    "import React from 'react';",
    "const label = 'Scroll back';",
    "const font = \"font-family:'Material Symbols Rounded';font-variation-settings:'FILL' 1,'wght' 400\";",
    "const cls = 'sn-int sn-row';",
  ].join('\n');
  assert.deepEqual(literals(scanJsx(src, 'X.jsx')), []);
});

test('ui/sonora Kotlin raw dp, sp, colours, alphas, tweens and z-indices are found, zero and comments are not', () => {
  const src = [
    'private val HAIRLINE = 1.dp',
    'val a = Modifier.padding(0.dp).size(24.dp).zIndex(1f).alpha(0.5f)',
    'val b = Text(fontSize = 14.sp, color = Color(0xFF000000).copy(alpha = 0.38f))',
    'val c = animateFloatAsState(1f, tween(300)) // tween(120) in a comment',
    '/* 48.dp in a block comment */',
    'val d = Modifier.size(SonoraDimens.iconSm).zIndex(0f)',
  ].join('\n');
  assert.deepEqual(literals(scanKotlin(src, 'X.kt')), [
    'size 1.dp',
    'size 24.dp',
    'z-index zIndex(1f',
    'opacity .alpha(0.5f',
    'size 14.sp',
    'colour Color(0xFF000000)',
    'opacity alpha = 0.38f',
    'duration tween(300',
  ]);
});
