/**
 * Lighthouse performance budget for the built `apps/web` app, desktop and mobile
 * form factors.
 *
 * A `.mjs` module rather than JSON, same reasoning as `bundle-budget.config.mjs`:
 * the reasoning for each number lives next to the number, so a budget nobody can
 * explain gets raised the first time it fails, which makes it worthless. Re-derive
 * by running `scripts/lighthouse-budget.sh -- --runs 5` (or more) with no budget
 * failures, reading the "measured:" line each form factor prints, and repeating
 * the arithmetic below — do not just nudge a failing number up to make CI pass.
 *
 * **What was audited, and what was not.** Every number below came from auditing a
 * single URL, `/`, on a freshly-booted server with `AURALIS_FAKE_UPSTREAMS=1` and
 * `DATA_DIR=:memory:` (`scripts/lighthouse-budget.sh`'s own boot, mirroring
 * `playwright.config.ts`'s second `webServer` entry). A fresh in-memory server
 * starts **unconfigured**, so `/` serves the onboarding/setup screen
 * (`SetupPage`), not the authenticated library/home experience a real user
 * spends most of their time in — this budget says nothing about the audiobook
 * library grid, the player, or any Jellyfin-backed music page, all of which are
 * heavier and unaudited. It also says nothing about the real production app
 * against a real Audiobookshelf/Jellyfin over a real network: the fake upstreams
 * respond near-instantly from the same process, so this measures the client's
 * own rendering cost, not upstream latency. Only the `performance` category is
 * budgeted — no accessibility, best-practices, SEO or PWA category.
 *
 * Baseline re-measured 2026-08-06, commit `a25d2ea` (phase 10, `Shell` moved from a
 * static import to `lazy()` — see that commit and `bundle-budget.config.mjs`'s own
 * re-derivation next to it), on the same laptop CI numbers are expected to roughly
 * track (`docs/HANDOVER.md` §4's "SofiaThinkPad"), via two independent verification
 * passes: `scripts/lighthouse-budget.sh -- --runs 6` then `-- --runs 5`. **The
 * budget numbers below are unchanged from the previous (`814a595`) baseline** —
 * re-measuring found no value outside the range that baseline's own numbers already
 * cover, mobile `score` included (see that metric's own comment for why this is an
 * honest, not a manufactured, non-result). Most numbers below follow `<worst single
 * sample observed> * (1 + headroom)`, rounded to a clean boundary — the score and
 * desktop/mobile timing metrics, where repeated verification runs keep landing
 * within a bounded, predictable distance of each baseline. **Two metrics don't**:
 * mobile `score` and mobile `tbt` are derived from the stable **median range**
 * observed across many re-verification runs instead, each one's own comment
 * explains why — on this machine those two are heavy-tailed enough that "worst
 * single sample" has no fixed value to converge on; every attempt to pin one down
 * was beaten by the next run.
 *
 * Headroom is wider for mobile than desktop throughout, for two compounding
 * reasons: mobile's `throttling` is *simulated* (Lighthouse models slow-4G
 * network and 4x CPU slowdown on top of whatever this machine's CPU actually
 * did), so its numbers carry both real run-to-run noise and simulation-model
 * noise, while desktop's `desktopDense4G` profile barely throttles at all; and
 * the CI runner's CPU is a different, unmeasured machine, so the "4x slowdown"
 * mobile applies to it is not guaranteed to land on the same absolute numbers
 * this laptop saw, even for an unchanged build. Desktop is far less exposed to
 * that gap since it throttles almost nothing.
 */
export const budget = {
  desktop: {
    /**
     * Performance category score, 0–1, a floor (higher is better). Original
     * 5-run baseline: median 0.95, range 0.95–0.95. Post-`a25d2ea`
     * re-verification: median 0.94 (0.94–0.95) on a 6-run pass, median 0.95
     * (0.95–0.95) on a 5-run pass — individual samples as low as 0.93 were
     * already seen pre-refactor, so this is within the pre-existing spread,
     * not a regression. Nothing close to mobile's noise (see mobile `score`'s
     * comment). Budget 0.90, comfortably below every value observed on
     * desktop across every run so far.
     */
    score: 0.9,
    /**
     * First Contentful Paint, ms, a ceiling. Original 5-run baseline: median
     * 1116, range 1092–1134; worst single sample seen anywhere on that build
     * was 1155ms. Post-`a25d2ea`: median 1122 (1103–1151) on a 6-run pass,
     * median 1096 (1091–1100) on a 5-run pass — same neighbourhood. Budget
     * 1450 stands unchanged (+26% over the 1155 worst-observed sample, not
     * just one baseline's own max) — wide relative to how tight the actual
     * local variance is, specifically to cover CI-runner variance this
     * laptop's own repeated runs cannot see (different CPU, different disk,
     * possibly a colder cache on first boot).
     */
    fcp: 1450,
    /**
     * Largest Contentful Paint, ms, a ceiling. Original 5-run baseline:
     * median 1219, range 1201–1303; worst single sample across
     * re-verification was 1388ms. Post-`a25d2ea`: median 1263 (1236–1280) on
     * a 6-run pass, median 1220 (1215–1227) on a 5-run pass — again within
     * the existing spread. Budget 1600 stands unchanged (+15% over that
     * 1388 worst-observed sample), same reasoning as FCP above — on this
     * trivial single-viewport page, LCP and FCP are nearly the same paint, so
     * the margin needed is similar even though the LCP baseline itself
     * already runs a bit hotter.
     */
    lcp: 1600,
    /**
     * Total Blocking Time, ms, a ceiling. Measured 0 on every one of 5 runs —
     * the onboarding screen does essentially no long main-thread task under
     * desktop's light throttling. A multiplicative headroom is meaningless
     * against a zero baseline (0 * anything is still 0), so this is a fixed
     * judgment-call ceiling instead: 100ms is comfortably above what any
     * plausible small regression here would produce while still catching a
     * real one (an unbatched synchronous data-crunch on load, say).
     */
    tbt: 100,
    /**
     * Cumulative Layout Shift, unitless, a ceiling. Measured 0.000 on every
     * run — nothing on the onboarding screen shifts after paint. Rather than
     * multiply a zero baseline, this uses Lighthouse's own published "good"
     * threshold (0.1) directly, which is both a recognizable industry number
     * and comfortably above the zero this page currently produces.
     */
    cls: 0.1,
    /**
     * Speed Index, ms, a ceiling. Effectively the same number as FCP on this
     * simple, mostly-static page in every run observed — the two audits
     * paint once and finish — so it gets the same budget and the same
     * reasoning as `fcp` above.
     */
    si: 1450,
  },
  mobile: {
    /**
     * Performance category score, 0–1, a floor. **Re-measured after `a25d2ea`
     * (Shell lazy-loaded out of the entry chunk) and unchanged**: a 6-run pass
     * measured median 0.61 (0.61–0.62), a following 5-run pass measured median
     * 0.62 (0.62–0.62) — the same 0.55–0.62 band the previous baseline (an
     * un-code-split entry chunk) already observed. This is the wave's honest
     * finding, not a gap in the fix: `a25d2ea` shrank the entry chunk by ~7%
     * (908,544 B raw / 236,244 B gzip — see `bundle-budget.config.mjs`), but the
     * page this budget audits (the unconfigured server's onboarding/setup
     * screen) still has to fetch and execute React, Mantine's base components,
     * react-query, the router and zustand before it can render anything — none
     * of which `a25d2ea` touched, because none of it is deferrable without
     * either breaking the app's actual boot sequence or (per `color`'s already-
     * critical-path use in `packages/ui/src/theme`) flashing an unthemed shell.
     * Score is downstream of TBT here (see this form factor's `tbt` comment for
     * why TBT is this budget's noisiest metric by far), so it inherits that
     * noise on top of the above. Deliberately not citing one "worst sample"
     * number the way the timing metrics below do: on this machine, every
     * attempt to pin one down was beaten by the next run, which is itself the
     * evidence that gating on individual samples would be meaningless here.
     * Budget 0.5, comfortably under the lowest *median* actually observed
     * across every verification pass so far (0.55), with real margin below it
     * precisely because outlier samples this deep into the tail are a known,
     * recurring feature of this metric on this machine, not a one-off. 0.61–0.62
     * itself is not a target to defend as "good" — see the ROADMAP §10 entry
     * next to `a25d2ea` for what was tried to move it and why it didn't. This
     * budget only guards against the score getting meaningfully *worse*, not
     * against it already being mediocre.
     */
    score: 0.5,
    /**
     * First Contentful Paint, ms, a ceiling. Original 5-run baseline: median
     * 5981, range 5894–6155; worst single sample across every re-verification
     * of that build was 6594ms. Post-`a25d2ea` re-verification (6-run then
     * 5-run pass): median 5993 (5984–6028), then median 5953 (5946–5955) — the
     * same neighbourhood, entirely within the pre-existing spread. Budget 8500
     * stands unchanged (+29% over the 6594 worst-observed sample) — wider than
     * desktop's corresponding margin for the compounding simulated-throttling
     * and CI-runner-CPU reasons in this file's header.
     */
    fcp: 8500,
    /**
     * Largest Contentful Paint, ms, a ceiling. Original 5-run baseline: median
     * 6556, range 6475–6740; worst single sample across re-verification of
     * that build was 7890ms. Post-`a25d2ea`: median 6724 (6569–6793), then
     * median 6649 (6489–6650) — again within the pre-existing spread. Budget
     * 9200 stands unchanged (+17% over that 7890 worst-observed sample) — a
     * tighter relative margin than FCP's only because the worst sample itself
     * already sits closer to the budget; the absolute headroom (over 1300ms)
     * is the larger of the two.
     */
    lcp: 9200,
    /**
     * Total Blocking Time, ms, a ceiling. This is the noisiest metric in the
     * whole budget by far, and the number below reflects that rather than a
     * clean formula. Four successive attempts to pin a "worst observed
     * sample" and add headroom over it were each beaten by the next
     * re-verification of the *same unchanged build*: 100 (over a 5-run
     * baseline max of 31ms), then 250 (after a 112ms sample), then 600 (after
     * a 351ms sample) — and a run *after* 600 was already shipped still
     * produced an individual sample of **940ms**. That escalating pattern is
     * itself the finding: this is not "the app got slower" four times over,
     * it is TBT being highly sensitive to this machine's own scheduling
     * jitter under a *simulated* 4x CPU slowdown (Lighthouse models the
     * slowdown on top of whatever the real CPU happened to be doing that
     * millisecond, so ordinary background contention gets amplified 4x into
     * the metric) — and chasing individual samples on a heavy-tailed
     * distribution is a game with no fixed ceiling to find.
     *
     * What stayed stable across every one of those same re-verification runs
     * was the **median of three runs** — the number this budget actually
     * gates on, per `evaluateBudget`'s use of `measured[key].median`, never
     * `.max`. Every median observed across this whole investigation stayed
     * at or under ~310ms; individual outlier samples went far higher without
     * ever dragging a 3-run median past that. Post-`a25d2ea` re-verification
     * (6-run then 5-run pass) stayed comfortably inside that same range:
     * median 62ms (samples 56–110), then median 32ms (samples 17–37) — both
     * far under the 310ms ceiling the original investigation established.
     * Budget 600 sits with real margin above that median range, not above any
     * one sample — a per-sample ceiling would have no defensible stopping
     * point on this metric, but a median-based one does. If this ever fails
     * in CI, the first move is not to raise the number further; it is to run
     * `--runs 7` or more locally and see whether the *median* (not a single
     * sample) has actually moved.
     */
    tbt: 600,
    /**
     * Cumulative Layout Shift, unitless, a ceiling. Measured 0.000 on every
     * run, same as desktop. Uses the same Lighthouse "good" threshold (0.1)
     * rather than a multiplied zero, for the same reason as desktop's.
     */
    cls: 0.1,
    /**
     * Speed Index, ms, a ceiling. Effectively the same number as mobile FCP
     * in every run observed, same reason as desktop's `si` above, so it gets
     * the same budget as `fcp` here too.
     */
    si: 8500,
  },
};
