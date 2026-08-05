/**
 * Performance budget for `apps/web`'s production build.
 *
 * A `.mjs` module rather than JSON so the reasoning for each number can live next
 * to the number itself — a budget nobody can explain gets raised the first time
 * it fails, which makes it worthless (docs/ROADMAP.md §10). Every value below is
 * `<measured baseline> * (1 + headroom)`, rounded to a clean KB boundary. Re-derive
 * by running `pnpm --filter @auralis/web build` then `node scripts/bundle-budget.mjs`
 * with no budget failures, reading the "measured" line it prints, and repeating the
 * arithmetic below — do not just nudge a failing number up to make CI pass.
 *
 * Baseline measured 2026-08-05, commit 9c162c2 (phase 9 done, phase 10 not started), by
 * this script's own `node scripts/bundle-budget.mjs` (Node's `zlib.gzipSync`, level 9 —
 * gzip byte counts are implementation-specific by a few hundred bytes, so the baseline
 * has to come from the same gzip this script uses at check time, not a different tool):
 *   entry   (index.html's own <script>+<link>): raw 971,803 B   gzip 253,884 B
 *   total   (every JS/CSS chunk Vite emits):    raw 1,068,472 B gzip 291,093 B
 *   largest single lazy chunk: SettingsPage, raw 13,661 B
 *
 * KB below means 1024 bytes, matching what `du`/Node report — not the 1000-byte
 * "KB" some bundler dashboards use.
 */
export const budget = {
  /**
   * The entry chunk(s) named directly in `dist/index.html` — the JS and CSS every
   * visit downloads and parses before the router picks a route. This is the one
   * number that maps straight onto "time to first interaction," so it gets the
   * tightest headroom of the five.
   *
   * raw: parse/compile cost, independent of network. 971,803 B measured -> 1200 KB
   * (1,228,800 B) is +26%. Phase 9 added Jellyfin browse/search/lyrics/favourites/
   * playlists/queue/requests as *lazy* routes without moving the entry chunk much,
   * so 26% is deliberately tighter than the total-bundle headroom below: the entry
   * chunk should only grow when the app shell itself grows (new nav destination,
   * new provider), not when a feature area gains another page.
   */
  entryRawBytes: 1_228_800,
  /**
   * gzip: what the browser actually transfers. 253,884 B measured -> 320 KB
   * (327,680 B) is +29%, slightly more headroom than raw because gzip ratio drifts
   * with content (more varied identifier names compress worse) independently of
   * anyone adding code.
   */
  entryGzipBytes: 327_680,
  /**
   * Every JS/CSS chunk Vite emits into `dist/assets` (entry + every lazy route +
   * every shared chunk Rollup splits out). The installed PWA precaches all of this
   * (`vite.config.ts`'s `globPatterns`), so it is real disk/transfer cost even
   * though most of it is not on the critical path for any single visit.
   *
   * raw: 1,068,472 B measured -> 1400 KB (1,433,600 B) is +34%. Wider headroom than
   * the entry budget on purpose: this number grows every time phase 9/10/11 adds a
   * route, which is expected and fine, whereas entry growth should be rare and
   * deliberate.
   */
  totalRawBytes: 1_433_600,
  /** gzip counterpart: 291,093 B measured -> 380 KB (389,120 B), same +34%. */
  totalGzipBytes: 389_120,
  /**
   * The single largest non-entry (lazily-loaded) chunk, raw bytes. A per-chunk
   * ceiling rather than a per-route one deliberately — route files get renamed and
   * split (see `routeTree.ts`'s history), so naming a budget after `SettingsPage`
   * by name would need editing on every refactor. "Whatever the biggest lazy chunk
   * is" survives renames and still catches the failure mode this guards against:
   * one page quietly pulling in something disproportionate (a chart library, an
   * un-tree-shaken icon set) that the total-bundle budget's slack would otherwise
   * hide for a while.
   *
   * 13,661 B measured (SettingsPage) -> 60 KB (61,440 B) is +350%, far more
   * headroom than the other four. Today's lazy pages are simple list/detail
   * screens; a legitimately richer page this project still owes itself (a full
   * lyrics view, an in-app queue editor) could reasonably land in the 20-40 KB
   * range without being a mistake. 60 KB still catches the actual failure mode —
   * an accidental whole-library import — while not nagging on ordinary feature
   * growth the way tight headroom would.
   */
  largestLazyChunkRawBytes: 61_440,
};
