/**
 * Lighthouse performance budget for the built `apps/web` app: two pages
 * (`signedOut`, `home`), desktop and mobile form factors each.
 *
 * A `.mjs` module rather than JSON, same reasoning as `bundle-budget.config.mjs`:
 * the reasoning for each number lives next to the number, so a budget nobody can
 * explain gets raised the first time it fails, which makes it worthless. Re-derive
 * by running `scripts/lighthouse-budget.sh -- --runs 5` (or more) with no budget
 * failures, reading each page/form-factor's "measured:" line, and repeating the
 * arithmetic below — do not just nudge a failing number up to make CI pass.
 *
 * **What is audited, and what still is not.** Both pages are the app's own root
 * URL (`/`) on a freshly-booted server with `AURALIS_FAKE_UPSTREAMS=1` and
 * `DATA_DIR=:memory:` (`scripts/lighthouse-budget.sh`'s own boot, mirroring
 * `playwright.config.ts`'s second `webServer` entry) — the SPA renders an
 * entirely different page at that one URL depending on server/session state,
 * not on the path:
 *   - **`signedOut`** — a fresh in-memory server starts unconfigured, so an
 *     unauthenticated `/` serves the onboarding/setup screen (`SetupPage`).
 *     This is the only page the budget covered before 2026-08-06.
 *   - **`home`** — `scripts/lighthouse-budget.mjs`'s `establishAuthenticatedSession`
 *     drives `POST /api/v1/setup` then `POST /api/v1/auth/login` directly over
 *     `fetch` (Lighthouse launches its own Chrome, not Playwright's, so there is
 *     no `page.context()` to hand a `storageState` file to) and attaches the
 *     resulting session cookie via Lighthouse's `extraHeaders`, so `/` instead
 *     serves the authenticated Home/library shelf experience a returning user
 *     actually spends their time in. `scripts/lighthouse-budget.mjs`'s
 *     `assertAuthenticated` checks every single run's `finalDisplayedUrl` and
 *     fails loudly (exit 2) rather than silently reporting `signedOut` numbers
 *     under a `home` label if the cookie ever stops working.
 *
 * **This closes a real hole, not a hypothetical one.** A previous wave moved
 * `Shell` (the whole authenticated app chrome) to a lazy import, taking ~62 KB
 * raw out of the entry chunk — and the score below did not move at all, because
 * this budget audited only `signedOut`, which never renders `Shell` regardless.
 * `docs/ROADMAP.md` §10 has the incident. `home` is still not the *heaviest*
 * authenticated page (the player and any Jellyfin-backed music page are
 * unaudited, and both are heavier), but it is the first thing a returning user
 * sees and it exercises the shell, nav chrome, mini player and a real content
 * grid — one page audited properly rather than three audited shallowly, per
 * this wave's own scoping (each extra page multiplies run time by samples ×
 * form factors). It also still says nothing about the real production app
 * against a real Audiobookshelf/Jellyfin over a real network: the fake upstreams
 * respond near-instantly from the same process, so this measures the client's
 * own rendering cost, not upstream latency. Only the `performance` category is
 * budgeted — no accessibility, best-practices, SEO or PWA category.
 *
 * **`signedOut` baseline**, re-measured 2026-08-06, commit `a25d2ea` (phase 10,
 * `Shell` moved from a static import to `lazy()` — see that commit and
 * `bundle-budget.config.mjs`'s own re-derivation next to it), on the same laptop
 * CI numbers are expected to roughly track (`docs/HANDOVER.md` §4's
 * "SofiaThinkPad"), via two independent verification passes:
 * `scripts/lighthouse-budget.sh -- --runs 6` then `-- --runs 5`. **The `signedOut`
 * budget numbers are unchanged from the previous (`814a595`) baseline** —
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
 * **`home` baseline**, measured 2026-08-06 on the same commit and machine, via two
 * independent passes (`-- --runs 6` then `-- --runs 5`), same method as `signedOut`
 * above — each metric's own comment has the numbers.
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
 *
 * **CI runs the same `--runs 3` default for both pages** — deliberately not
 * reduced for `home` even though two pages cost roughly twice what one did:
 * `home`'s own numbers (see below) are close enough to `signedOut`'s that a
 * thinner CI sample would make `home` noisier precisely where noise is least
 * affordable (a heavier page, on an unmeasured runner CPU, under mobile's
 * simulated throttling). If CI run time becomes a real problem, drop the
 * *pass count* on `bundle-budget`-style checks before dropping Lighthouse's
 * `--runs`, which trades directly against how much a false failure costs to
 * chase down.
 */
export const budget = {
  signedOut: {
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
  },
  home: {
    desktop: {
      /**
       * Performance category score, 0–1, a floor. Measured 2026-08-06, commit
       * `daa7c8b`, two independent passes: median 0.94 (0.93–0.94) on a 6-run
       * pass, median 0.94 (0.93–0.95) on a 5-run pass — both essentially
       * identical to `signedOut` desktop's own score, which makes sense on a
       * trivial single-viewport, near-instant-fake-upstream render: `Shell`'s
       * extra chrome (nav rail, mini player) is real but cheap to paint once
       * it's downloaded, and desktop's `desktopDense4G` profile barely
       * throttles the download either. Budget 0.90, same floor as `signedOut`
       * and comfortably below every value observed.
       */
      score: 0.9,
      /**
       * First Contentful Paint, ms, a ceiling. Measured 2026-08-06: median
       * 1125 (1115–1152) on a 6-run pass, median 1134 (1105–1148) on a 5-run
       * pass; worst single sample across both was 1152ms. Budget 1450 (+26%
       * over that worst sample) — same number as `signedOut`'s, arrived at
       * independently rather than copied: the two pages' desktop FCP
       * distributions are simply this close. Only two verification passes
       * back this (`signedOut`'s own margin rests on a longer history of
       * re-verification across several commits); if this ever fails in CI,
       * treat it as less proven than `signedOut`'s and re-derive rather than
       * assuming the failure is spurious.
       */
      fcp: 1450,
      /**
       * Largest Contentful Paint, ms, a ceiling. Measured 2026-08-06: median
       * 1303 (1285–1341) on a 6-run pass, median 1316 (1267–1352) on a 5-run
       * pass; worst single sample was 1352ms. Budget 1600 (+18% over that
       * worst sample) — again landing on the same number as `signedOut`'s,
       * for the same reason FCP did.
       */
      lcp: 1600,
      /**
       * Total Blocking Time, ms, a ceiling. Measured 0–10ms across every run
       * of both passes (median 1ms, then 3ms) — `Shell`'s extra mount work is
       * real but not a long task under desktop's light throttling. Same
       * reasoning as `signedOut`'s: a multiplicative headroom is meaningless
       * against a near-zero baseline, so this is a fixed judgment-call
       * ceiling, and the same one (100ms) — comfortably above any plausible
       * small regression while still catching a real one.
       */
      tbt: 100,
      /**
       * Cumulative Layout Shift, unitless, a ceiling. Measured 0.001 on every
       * run of both passes — **not** zero, unlike `signedOut`: Home renders
       * real shelf content (cover art loading in) rather than a static form,
       * so a small, consistent shift is expected. Still uses Lighthouse's own
       * "good" threshold (0.1) rather than a multiplied 0.001, since a
       * headroom multiplier this close to zero would be a rounding exercise,
       * not a real bound — 0.1 is both recognizable and >100x the observed
       * value.
       */
      cls: 0.1,
      /**
       * Speed Index, ms, a ceiling. Effectively the same number as FCP in
       * every run observed, same reasoning as `signedOut`'s own `si`.
       */
      si: 1450,
    },
    mobile: {
      /**
       * Performance category score, 0–1, a floor. Measured 2026-08-06: median
       * 0.59 (0.55–0.60) on a 6-run pass, median 0.61 (0.53–0.61) on a 5-run
       * pass — within a point or two of `signedOut` mobile's own 0.55–0.62
       * band, which was not expected going in (Home renders `Shell` plus a
       * real shelf, `signedOut` renders a bare form) but is explained by
       * `signedOut`'s own header comment on `Shell`: both pages already pay
       * for React, Mantine, react-query, the router and zustand before
       * anything paints, and that shared cost dominates mobile's simulated
       * 4x-CPU/slow-4G throttle either way. Budget 0.5, same floor as
       * `signedOut`, comfortably below both medians observed — with the same
       * caveat as `home` desktop's `fcp` above: this rests on two
       * verification passes, not `signedOut`'s longer history, so treat a
       * future failure here as needing re-derivation rather than dismissal.
       */
      score: 0.5,
      /**
       * First Contentful Paint, ms, a ceiling. Measured 2026-08-06: median
       * 6004 (5971–6025) on a 6-run pass, median 5999 (5940–6106) on a 5-run
       * pass; worst single sample across both was 6106ms — again close to
       * `signedOut` mobile's own FCP, for the reason `score` above explains.
       * Budget 8000 (+31% over that worst sample), a wider relative margin
       * than `signedOut`'s FCP (+29%) specifically because this baseline has
       * only two passes behind it rather than several.
       */
      fcp: 8000,
      /**
       * Largest Contentful Paint, ms, a ceiling. Measured 2026-08-06: median
       * 6851 (6740–7293) on a 6-run pass, median 6778 (6697–7196) on a 5-run
       * pass; worst single sample was 7293ms. Budget 8800 (+21% over that
       * worst sample), same reasoning as `fcp` above for why the margin is a
       * little wider than `signedOut`'s equivalent (+17%).
       */
      lcp: 8800,
      /**
       * Total Blocking Time, ms, a ceiling. Measured 2026-08-06: median 179ms
       * (samples 142–298) on a 6-run pass, median 137ms (samples 112–355) on
       * a 5-run pass — the same heavy-tailed shape `signedOut` mobile's own
       * `tbt` documents at length (simulated 4x CPU throttle amplifying this
       * machine's ordinary scheduling jitter), just with fewer re-verification
       * passes behind it. Rather than re-run `signedOut`'s multi-pass
       * escalation to find home's own "worst observed sample with no fixed
       * ceiling," this reuses `signedOut`'s already-established 600ms budget
       * directly: home's own median range (112–355ms observed) sits
       * comfortably inside it, and the underlying noise source (this
       * machine's simulated-throttle jitter) is the same mechanism, not a
       * page-specific one, so there is no reason to expect home's ceiling to
       * need to be a different number.
       */
      tbt: 600,
      /**
       * Cumulative Layout Shift, unitless, a ceiling. Measured 0.008 on every
       * run of both passes — small and consistent, from the same real shelf
       * content `home` desktop's own `cls` comment explains, just slightly
       * larger under mobile's viewport. Same Lighthouse "good" threshold
       * (0.1) as every other `cls` budget in this file — still >10x the
       * observed value.
       */
      cls: 0.1,
      /**
       * Speed Index, ms, a ceiling. Effectively the same number as mobile FCP
       * in every run observed, same reasoning as `signedOut`'s own `si`.
       */
      si: 8000,
    },
  },
};
