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
 * Baseline measured 2026-08-06, commit `a98736a` (phase 10, Shell lazy-loaded out of
 * the entry chunk — see that commit and the ROADMAP §10 entry next to it), by this
 * script's own `node scripts/bundle-budget.mjs` (Node's `zlib.gzipSync`, level 9 —
 * gzip byte counts are implementation-specific by a few hundred bytes, so the baseline
 * has to come from the same gzip this script uses at check time, not a different tool):
 *   entry   (index.html's own <script>+<link>): raw 908,544 B   gzip 236,244 B
 *   total   (every JS/CSS chunk Vite emits):    raw 1,076,973 B gzip 298,410 B
 *   largest single lazy chunk: Shell, raw 34,952 B
 *
 * These numbers are **tighter on entry, not on total** than the previous baseline
 * (2026-08-05, commit `9c162c2`: entry raw 971,803 B / gzip 253,884 B, total raw
 * 1,068,472 B). `a98736a` moved the app shell — nav chrome, mini player, the full
 * Now Playing sheet (chapters, lyrics, sleep timer) — from a static import in
 * `RootLayout` to a `lazy()` one, so that code now ships in `Shell`'s own chunk
 * instead of the entry chunk. Total bundle size is essentially unchanged (that code
 * still ships, just later); what changed is *when* a fresh visit has to pay for it.
 * `largestLazyChunkRawBytes` below is re-derived with this in mind: `Shell` is now a
 * real, substantial, load-bearing chunk rather than a simple list page, so its
 * headroom is deliberately narrower than the previous baseline used — see that
 * budget's own comment.
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
   * raw: parse/compile cost, independent of network. 908,544 B measured -> 1120 KB
   * (1,146,880 B) is +26.2%, the same relative headroom the previous baseline used
   * (26%) — this is a genuine drop in the number itself (1200 KB -> 1120 KB), not a
   * loosened policy, reflecting `a98736a`'s real ~62 KB reduction. It stays tight for
   * the same reason as before: the entry chunk should only grow when the app shell
   * itself grows (a new nav destination, a new eagerly-needed provider), not when a
   * feature area gains another lazy page.
   */
  entryRawBytes: 1_146_880,
  /**
   * gzip: what the browser actually transfers. 236,244 B measured -> 300 KB
   * (307,200 B) is +30.0%, down from the previous 320 KB ceiling — same reasoning as
   * raw above, a real tightening rather than a nudge.
   */
  entryGzipBytes: 307_200,
  /**
   * Every JS/CSS chunk Vite emits into `dist/assets` (entry + every lazy route +
   * every shared chunk Rollup splits out). The installed PWA precaches all of this
   * (`vite.config.ts`'s `globPatterns`), so it is real disk/transfer cost even
   * though most of it is not on the critical path for any single visit.
   *
   * raw: 1,076,973 B measured -> 1420 KB (1,454,080 B) is +35.0%. Essentially
   * unchanged from the previous 1400 KB ceiling — `a98736a` moved bytes from entry
   * to lazy, it did not add or remove any, so total bundle size barely moved
   * (1,068,472 B -> 1,076,973 B, the ~8.5 KB difference being `Shell`'s own
   * `Suspense`/`lazy` wiring plus normal chunk-boundary overhead from the new split).
   */
  totalRawBytes: 1_454_080,
  /** gzip counterpart: 298,410 B measured -> 400 KB (409,600 B), +37.3% — a touch
   *  more headroom than raw because that same small wiring overhead compresses worse
   *  than the code it wraps (more unique identifiers, less repetition). */
  totalGzipBytes: 409_600,
  /**
   * The single largest non-entry (lazily-loaded) chunk, raw bytes. A per-chunk
   * ceiling rather than a per-route one deliberately — route files get renamed and
   * split (see `routeTree.ts`'s history), so naming a budget after one file by name
   * would need editing on every refactor. "Whatever the biggest lazy chunk is"
   * survives renames and still catches the failure mode this guards against: one
   * page (or, as of `a98736a`, the shell itself) quietly pulling in something
   * disproportionate that the total-bundle budget's slack would otherwise hide.
   *
   * `Shell` is now that chunk, at 34,952 B measured — a real, substantial chunk (nav
   * chrome, mini player, the full Now Playing sheet and everything it reaches:
   * chapters, lyrics, the sleep timer, bookmarks), not a simple list/detail screen
   * like the previous baseline's `SettingsPage` (13,661 B). Headroom is deliberately
   * narrower than the previous +350%: 72 KB (73,728 B) is +110.9%, still generous
   * enough to cover legitimate growth of the player surface (another sheet section,
   * a richer queue editor) without the previous budget's wide berth, which was sized
   * for a page this project expected to stay small. 72 KB still catches the actual
   * failure mode — an accidental whole-library import, or a second big feature
   * quietly landing in the same lazy chunk as the shell.
   */
  largestLazyChunkRawBytes: 73_728,
};
