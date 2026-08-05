#!/usr/bin/env node
/**
 * Web bundle performance budget — Phase 10's first release-polish check
 * (docs/ROADMAP.md §10).
 *
 * The web app is also the desktop/PWA experience, so its bundle is the whole
 * product's cost of entry. Nothing measured that before this script: phase 9 alone
 * added Jellyfin browse/search/lyrics/favourites/playlists/queue/requests as new
 * routes with nobody watching what that did to what ships. This turns "the UI must
 * be beautiful and performant" into a number CI checks on every push instead of an
 * intention nobody re-derives.
 *
 * What it measures, straight from `apps/web/dist` (must already be built — this
 * script does not build it):
 *   - entry:  the JS + CSS named directly in dist/index.html's own <script>/<link>
 *             tags — what every visit downloads and parses before the router picks
 *             a route. Found by parsing index.html rather than matching a filename
 *             pattern like "index-*", because a lazy chunk could coincidentally
 *             collide with that pattern and Vite's content-hashed names are not a
 *             stable contract to pattern-match against.
 *   - total:  every JS/CSS file Vite emits into dist/assets — entry plus every
 *             lazily-loaded route and every shared chunk Rollup splits out. The PWA
 *             precaches all of it (vite.config.ts's `globPatterns`), so it's real
 *             transfer/disk cost even though most of it isn't on the critical path
 *             of any one visit.
 *   - largest lazy chunk: whichever non-entry chunk is biggest, by raw bytes. A
 *             per-chunk ceiling rather than a named per-route one, so it survives
 *             route file renames and still catches one page quietly pulling in
 *             something disproportionate.
 *
 * Both raw (parse/compile cost, and what "total" bounds for PWA storage) and gzip
 * (what the browser actually transfers) are budgeted for entry and total — see
 * bundle-budget.config.mjs's own doc comment for why both, and for where every
 * number in the budget came from.
 *
 * dist/sw.js and dist/workbox-*.js (vite-plugin-pwa's own runtime, emitted at the
 * dist root rather than into assets/) are deliberately excluded: they're a fixed
 * third-party runtime, not app code, and no route regression touches them.
 *
 * Usage:
 *   node scripts/bundle-budget.mjs [--dist apps/web/dist] [--budget scripts/bundle-budget.config.mjs]
 *
 * Exit 0: build present and within budget (or dist missing — see below).
 * Exit 1: build present and over budget on at least one metric.
 *
 * Missing dist/ is reported and exits 0, not 1 — this script does not build the
 * app itself (CI's bundle-budget job runs `pnpm --filter @auralis/web build`
 * first), so "wasn't built yet" is a caller-ordering fact, not a budget failure,
 * and must never be the reason this check goes red.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

/** Pulls the entry JS/CSS basenames straight out of index.html's own tags. */
export function readEntryAssetNames(html) {
  const js = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)].map((m) =>
    basename(m[1]),
  );
  const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) =>
    basename(m[1]),
  );
  return { js, css };
}

/** gzip at the same level Vite's own build report uses, for numbers that agree. */
export function gzipSize(buffer) {
  return gzipSync(buffer, { level: 9 }).length;
}

/**
 * Buckets every JS/CSS file in `assetsDir` into entry vs. lazy, given the entry
 * basenames from `readEntryAssetNames`. Pure given its inputs — the only I/O is the
 * directory read and per-file gzip, both done here so `bucketize` itself stays a
 * plain function the tests can drive with fabricated file lists.
 */
export function measureAssetsDir(assetsDir, entryNames) {
  const entrySet = new Set([...entryNames.js, ...entryNames.css]);
  const files = readdirSync(assetsDir).filter((f) => f.endsWith('.js') || f.endsWith('.css'));
  const measured = files.map((name) => {
    const raw = readFileSync(join(assetsDir, name));
    return { name, raw: raw.length, gzip: gzipSize(raw), isEntry: entrySet.has(name) };
  });
  return bucketize(measured);
}

/** The pure bucketing logic: given per-file {name, raw, gzip, isEntry}, sum the buckets. */
export function bucketize(files) {
  const entry = { raw: 0, gzip: 0 };
  const lazy = { raw: 0, gzip: 0 };
  let largestLazy = null;
  for (const f of files) {
    const bucket = f.isEntry ? entry : lazy;
    bucket.raw += f.raw;
    bucket.gzip += f.gzip;
    if (!f.isEntry && (largestLazy === null || f.raw > largestLazy.raw)) {
      largestLazy = { name: f.name, raw: f.raw, gzip: f.gzip };
    }
  }
  const total = { raw: entry.raw + lazy.raw, gzip: entry.gzip + lazy.gzip };
  return { entry, lazy, total, largestLazy };
}

/** 1024-based, matching the budget file's own "KB means 1024 bytes" convention. */
export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

/**
 * Compares measured sizes against the budget. Returns one result per metric so the
 * report can show every number, not just the first failure — a run that only ever
 * reports one problem at a time hides how far off the others are.
 */
export function evaluateBudget(measured, budgetConfig) {
  const checks = [
    ['entryRawBytes', 'entry, raw', measured.entry.raw],
    ['entryGzipBytes', 'entry, gzip', measured.entry.gzip],
    ['totalRawBytes', 'total, raw', measured.total.raw],
    ['totalGzipBytes', 'total, gzip', measured.total.gzip],
    ['largestLazyChunkRawBytes', 'largest lazy chunk, raw', measured.largestLazy?.raw ?? 0],
  ];
  return checks.map(([key, label, value]) => {
    const limit = budgetConfig[key];
    const pass = value <= limit;
    return { key, label, value, limit, pass, overBy: pass ? 0 : value - limit };
  });
}

/** The human-readable report: every metric's measured/limit, and what's over and by how much. */
export function formatReport(results, largestLazy) {
  const lines = ['Web bundle budget (apps/web/dist):', ''];
  for (const r of results) {
    const status = r.pass ? 'ok  ' : 'OVER';
    lines.push(
      `  [${status}] ${r.label.padEnd(24)} ${formatBytes(r.value).padStart(10)} / ${formatBytes(r.limit).padStart(10)} budget`,
    );
  }
  if (largestLazy) {
    lines.push('', `  largest lazy chunk is ${largestLazy.name} (${formatBytes(largestLazy.raw)})`);
  }
  const failures = results.filter((r) => !r.pass);
  if (failures.length > 0) {
    lines.push('', 'Over budget:');
    for (const f of failures) {
      lines.push(
        `  - ${f.label}: ${formatBytes(f.value)} exceeds the ${formatBytes(f.limit)} budget by ${formatBytes(f.overBy)}.`,
      );
    }
    lines.push(
      '',
      "What to do: find what grew (`pnpm --filter @auralis/web build` prints every chunk's",
      'size) and either trim it or, if the growth is deliberate, raise the relevant number',
      'in scripts/bundle-budget.config.mjs with the same reasoning-in-comments style already',
      'there — re-measure first, do not just add headroom to the failing number.',
    );
  }
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? fallback : args[i + 1];
  };
  const distDir = join(process.cwd(), flag('dist', 'apps/web/dist'));
  const budgetPath = flag('budget', join(here, 'bundle-budget.config.mjs'));

  const indexHtmlPath = join(distDir, 'index.html');
  if (!existsSync(indexHtmlPath)) {
    console.log(
      `No build found at ${distDir} (no index.html) — nothing to check. ` +
        `Run "pnpm --filter @auralis/web build" first if you expected a report here.`,
    );
    process.exit(0);
  }

  const html = readFileSync(indexHtmlPath, 'utf8');
  const entryNames = readEntryAssetNames(html);
  const assetsDir = join(distDir, 'assets');
  if (!statSync(assetsDir, { throwIfNoEntry: false })) {
    console.error(`${assetsDir} does not exist, but ${indexHtmlPath} does — build looks broken.`);
    process.exit(1);
  }

  const measured = measureAssetsDir(assetsDir, entryNames);
  const { budget: budgetConfig } = await import(budgetPath);
  const results = evaluateBudget(measured, budgetConfig);
  const report = formatReport(results, measured.largestLazy);
  console.log(report);

  process.exit(results.every((r) => r.pass) ? 0 : 1);
}

// Only run when invoked directly (`node scripts/bundle-budget.mjs`), not when
// imported by the test file — the tests exercise the pure functions above without
// touching a real dist/ directory.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
