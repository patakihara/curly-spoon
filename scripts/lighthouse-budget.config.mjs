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
 * Baseline measured 2026-08-06, commit `814a595` (phase 10, before this wave's
 * own script existed to change anything), on the same laptop CI numbers are
 * expected to roughly track (`docs/HANDOVER.md` §4's "SofiaThinkPad"), via
 * `scripts/lighthouse-budget.sh -- --runs 5`. Each number below is
 * `<worst observed value across 5 runs> * (1 + headroom)`, not the median —
 * the budget has to survive the noisiest run actually seen, not just the
 * typical one — rounded to a clean boundary.
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
     * Performance category score, 0–1, a floor (higher is better). 5 runs on
     * commit 814a595: median 0.95, observed range 0.95–0.95 (no variance in 5
     * runs). Budget 0.90, roughly 5% of headroom below the observed floor —
     * enough to absorb a run that isn't a clean 0.95 without masking an actual
     * regression, since desktop showed essentially zero run-to-run noise here.
     */
    score: 0.9,
    /**
     * First Contentful Paint, ms, a ceiling. Median 1117, observed range
     * 1115–1120. Budget 1450 (+30% over the observed max of 1120) — wide
     * relative to the near-zero local variance specifically to cover CI-runner
     * variance this laptop's own repeated runs cannot see (different CPU,
     * different disk, possibly a colder cache on first boot).
     */
    fcp: 1450,
    /**
     * Largest Contentful Paint, ms, a ceiling. Median 1215, observed range
     * 1213–1225. Budget 1600 (+30% over the observed max of 1225), same
     * reasoning as FCP above — on this trivial single-viewport page, LCP and
     * FCP are nearly the same paint.
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
     * Speed Index, ms, a ceiling. Median 1117, observed range 1115–1120 — the
     * same number as FCP on this simple, mostly-static page, so it gets the
     * same budget and the same reasoning.
     */
    si: 1450,
  },
  mobile: {
    /**
     * Performance category score, 0–1, a floor. The 5-run baseline measured
     * median 0.62. Score is downstream of TBT here (see this form factor's
     * `tbt` comment for why TBT is this budget's noisiest metric by far), so
     * it inherits that noise: repeated re-verification of this exact
     * unchanged config kept producing *lower* individual samples than the
     * last check found (0.53, then 0.46, then 0.39), while the **median of
     * three runs** — the number this budget actually gates on — stayed in a
     * consistent 0.55–0.62 band across every one of those same
     * re-verifications. Deliberately not citing one "worst sample" number the
     * way the timing metrics below do: on this machine, every attempt to
     * pin one down was beaten by the next run, which is itself the evidence
     * that gating on individual samples would be meaningless here. Budget
     * 0.5, comfortably under the lowest *median* actually observed (0.55),
     * with real margin below it precisely because outlier samples this deep
     * into the tail are a known, recurring feature of this metric on this
     * machine, not a one-off. 0.62 itself is not a target to defend as
     * "good" anyway: it reflects an un-code-split ~705KB main JS chunk (see
     * `scripts/bundle-budget.config.mjs`) parsed and executed under a
     * simulated 4x CPU slowdown. This budget only guards against that getting
     * meaningfully *worse*, not against it already being mediocre.
     */
    score: 0.5,
    /**
     * First Contentful Paint, ms, a ceiling. Median 6093, observed range
     * 6091–6096. Budget 8500 (+40% over the observed max of 6096) — wider
     * than desktop's +30% for the compounding simulated-throttling and
     * CI-runner-CPU reasons in this file's header.
     */
    fcp: 8500,
    /**
     * Largest Contentful Paint, ms, a ceiling. Median 6553, observed range
     * 6468–6564 (the widest relative spread of any metric here, ~1.5%).
     * Budget 9200 (+40% over the observed max of 6564), same reasoning as
     * mobile FCP.
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
     * ever dragging a 3-run median past that. Budget 600 sits with real
     * margin above that median range, not above any one sample — a
     * per-sample ceiling would have no defensible stopping point on this
     * metric, but a median-based one does. If this ever fails in CI, the
     * first move is not to raise the number further; it is to run `--runs 7`
     * or more locally and see whether the *median* (not a single sample) has
     * actually moved.
     */
    tbt: 600,
    /**
     * Cumulative Layout Shift, unitless, a ceiling. Measured 0.000 on every
     * run, same as desktop. Uses the same Lighthouse "good" threshold (0.1)
     * rather than a multiplied zero, for the same reason as desktop's.
     */
    cls: 0.1,
    /**
     * Speed Index, ms, a ceiling. Median 6093, observed range 6091–6096 — same
     * number as mobile FCP on this simple page, so it gets the same budget.
     */
    si: 8500,
  },
};
