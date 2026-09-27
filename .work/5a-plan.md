# 5a plan: "M0 plan in repo"

The rebuild plan moves from the published artifact into `docs/plan/` as Markdown. That folder
becomes the source of truth, and the artifact is generated from it. Progress is computed from the
repo and never written by hand. The build agent executes this document exactly. Where this
document says "decided", don't reopen it.

Repo: `/home/sofiapata/src/auralis-src` (branch `main`). Live page (the source to migrate):
`/home/sofiapata/.claude/jobs/500067f0/tmp/plan/live/index.html`. It opens with a platform-added
wrapper. The page proper starts at the second `<!doctype html>` (line 2). The `<style>` block is
lines 10–110, `<main>` starts at line 142, and the sections run from line 151 to line 973.

---

## 0. Before dispatch (orchestrator, not the build agent)

1. `pnpm add -Dw marked@^15` (the only new dependency). Commit `package.json` and
   `pnpm-lock.yaml` with `Plan: M0.plan`. The build agent must not run `pnpm add` or
   `pnpm install`. If `node -e "import('marked')"` fails in its tree, it stops and reports.
2. The main checkout has uncommitted changes to `.github/workflows/{android,fdroid-repo,release}.yml`
   that don't belong to this piece. The build agent does not touch those three files. The only
   workflow it edits is `ci.yml`.
3. The build agent works under `isolation: "worktree"`. Its first action is
   `git reset --hard <main tip sha>`, then it checks with `git log -1`. It commits on its own branch
   and never pushes.

## 1. Decisions

### 1.1 Source format: Markdown, one file per section, with a strict item grammar

Decided: Markdown (GFM via `marked`), with one file per page section plus a header file. Prose
stays readable and diffs stay small, and the inbox-sorting subagents edit sentences, not markup.
The few layout constructs the page uses (hero, cards, grids, callouts, diagrams, milestone blocks)
get a small, closed directive set. Everything else is plain Markdown.

```
docs/plan/
  README.md            format + commands (not part of the page; excluded from checks)
  _header.md           eyebrow, h1, provenance paragraph
  00-tldr.md … 18-unverified.md    one per section, in page order
  page.css             the live page's CSS, verbatim, plus one appended "generated" block
  diagrams/{play,get,discover,arch}.svg   the four inline SVGs, verbatim
```

**Section file front matter** (exactly these three keys, in this order):

```
---
id: spotify
nav: Replacing Spotify
part: Why and what
---
## What replacing Spotify means
```

- `id` is the section's anchor (the live `<section id>`). `nav` is the rail label.
  `part` is the part name. A part head (`<div class="part-head"><span>Part N</span>…`) and a rail
  group are emitted whenever `part` changes. N counts from 1.
- Filename is `NN-<id>.md`, with NN contiguous from `00`. Section number = NN. The eyebrow shows
  NN for every section except `00` (the live `tldr` has no eyebrow).
- In a file, `##` is the section's h2 (exactly one, first), `###` is h3, and `####` is h4. `#` is
  used only in `_header.md`.

**`_header.md`**:

```
---
title: Auralis rebuild plan
eyebrow: Auralis · from scratch
brand: Auralis
brand-sub: Rebuild plan
---
# A plan that ends with Spotify uninstalled

Based on `patakihara/curly-spoon` at `781efd4` (2026-08-21, the latest commit on GitHub), … (verbatim)
```

The rail's brand-sub renders as `Rebuild plan · <commit date of HEAD, YYYY-MM-DD>`. The date comes
from git and is never in source.

**Directives** (a line on its own, closed by a line `:::`, nestable). This set is closed; the lint
rejects anything else:

| Directive | Renders |
|---|---|
| `::: hero` | `<div class="hero">…</div>` (content is an ordered list `1.`) |
| `::: grid g2` / `::: grid g3` | `<div class="grid g2">` / `g3` |
| `::: card` | `<div class="card">`. Every top-level `<ul>`, `<ol>` and `<p>` inside gets `class="small"` |
| `::: callout` / `::: callout warn` | `<div class="callout">` / `<div class="callout warn">`. A single paragraph is unwrapped, so the div holds inline content as in the live page |
| `::: lede` / `::: cap` / `::: small muted` | if the content is one paragraph: `<p class="lede">` / `<p class="cap">` / `<p class="small muted">`; otherwise a div with that class |
| `::: diagram <name>` (self-closing, no body, no `:::`) | `<div class="diagram">` + `diagrams/<name>.svg` inlined verbatim |

**Allowed raw HTML in Markdown**: only `<span class="pill t-lib|t-prog|t-req|t-err">…</span>`,
and `<ul>`, `</ul>`, `<li>`, `</li>` on GFM table rows (lines starting `|`), for the one table cell
that holds a list. Hard line breaks use a trailing backslash `\`. `&nbsp;` is allowed as an entity.

**Milestones** (only in `15-milestones.md`, after its intro paragraph):

```
### M0 · Foundations

- **[M0.repo]** The rebuild happens **in the same GitHub repository** (…).
  _Done when:_ (a) a test asserts …; (b) a test asserts ….
- **[M0.schema]** zod → OpenAPI → generated TS and Kotlin clients, enforced in CI.
  _Done when:_ (a) …; (b) ….

**[M0.exit] Done when** you sign in to the staging container … from generated types.
_Done when:_ (a) Sofia's sign-off.
```

Grammar (these are the parser's regexes; the lint enforces them):

- Milestone heading: `^### (M[0-6]) · (.+)$`. M0 to M6 each appear exactly once, in order.
- Item line: `^- \*\*\[(M[0-6])\.([a-z][a-z0-9]{1,15})\]\*\* (.+)$`. The id's `M<n>` must equal
  its milestone. Slugs have no hyphens or underscores, so the id survives JVM method names (below).
- The line right after an item must be `^  _Done when:_ (.+)$` (two-space continuation).
- Exit paragraph: `^\*\*\[(M[0-6])\.exit\] Done when\*\* (.+)$`, followed by the line
  `^_Done when:_ (.+)$`. Every milestone M0 to M5 has exactly one exit, as its last block. M6 has none.
- Criteria inside a done-when: `(a) text; (b) text; … .`, split on `; (` + letter + `) `. Letters
  run consecutively from `a`, with 1–6 criteria. A criterion whose text begins `Sofia's sign-off`
  is a **sign-off criterion** (at most one per item). Every other criterion is a **test criterion**
  and must be at least 6 words.

### 1.2 How a check is tagged: test names, plus git tags for sign-offs

Decided. There are exactly two kinds of check.

- **Test criterion** `(x)` of item `M1.gapless` is satisfied by tests whose name carries the tag:
  - JS/TS (vitest, `node:test`, Playwright): `[M1.gapless/x]` anywhere in the full test name,
    e.g. `it('[M1.gapless/a] second file starts with no gap', …)`.
  - Kotlin/JVM (JUnit, Robolectric, instrumented): the method name starts with `M1_gapless_x_`,
    because `[`, `/` and `.` are illegal in JVM method names. Example:
    `` fun `M1_gapless_b_second file follows first`() ``, or `M1_gapless_b_secondFileFollowsFirst`
    for instrumented tests.
  - Recordings, routes, generated output and files that must exist are all checked by tests. A
    "recording exists and is scrubbed" check is a test that reads the recording.
- **Sign-off criterion**: an annotated git tag `signoff/<ID>`, e.g. `signoff/M0.exit` or
  `signoff/M0.fdroid`. The session creates it only when Sofia says so, with her words as the tag
  message, and pushes it (`git push origin signoff/<ID>`).
- Parse regexes: JS `\[(M[0-6]\.[a-z][a-z0-9]{1,15})\/([a-f])\]`; JVM
  `^(M[0-6])_([a-z][a-z0-9]{1,15})_([a-f])(?:_|\s|$)` against the JUnit `name` attribute.

**Criterion status**: `passed` (at least 1 tagged test passed and none failed), `failed` (any
tagged test failed), `missing` (no tagged test in the results), `unknown` (no results available).
A sign-off criterion is `passed` if the tag exists and `missing` otherwise.
**Item status**: `done` if every criterion passed; `failing` if any failed; otherwise `open`.
Separately, an item is `inProgress` if a branch named `plan/<ID>` or `plan/<ID>-<anything>` exists
locally or on `origin`. Its note is `git config branch.<name>.description` ("no note" for
remote-only branches).
**Current milestone**: the first M0–M6 with any item not done. **Next**: the first item of the
current milestone, in document order, that is neither done nor in progress. The exit item counts
only once every other item is done.

### 1.3 Where test results come from

Progress is never stored in the repo. CI produces results as artifacts, and `progress.mjs` reads
them.

- Every CI job that runs tests writes JUnit XML, then (with `if: always()`) runs
  `node scripts/plan/collect-results.mjs --workflow <wf> --job <job> --out reports/plan-results.json reports/junit/*.xml`
  and uploads artifact `plan-results-<wf>-<job>` (`if: always()`, so failures get recorded).
  `plan-results.json` = `{ "commit": "<sha40>", "workflow": "ci", "job": "unit", "tests": [ { "item": "M0.plan", "criterion": "a", "name": "<full name>", "status": "passed|failed|skipped" } ] }`,
  holding tagged tests only.
- This piece wires **only `ci.yml`'s unit job**. Android JUnit/instrumented collection lands with
  the first Android-tagged test (`M0.emulator`), Playwright collection with the first Playwright
  test, and a scheduled `plan-live.yml` (network checks against mediaserver and the F-Droid repo)
  with the first live test. Each of those follows the same four lines.
- `progress.mjs` in `ci` mode (the default): `gh run list --branch main --limit 100 --json
  databaseId,headSha,workflowName,status,conclusion,createdAt`. It keeps runs whose `headSha` is an
  ancestor of HEAD (`git merge-base --is-ancestor`), takes the newest completed run per workflow
  name, and downloads its `plan-results-*` artifacts with
  `gh run download <id> --pattern 'plan-results-*' --dir .cache/plan/runs/<id>` (cached by run id).
  It unions the tests; per test name, the newer run wins. It reports each source's commit and how
  many commits it is behind HEAD.
- `local` mode additionally runs vitest and the node tests with JUnit reporters into
  `.cache/plan/local/` and lays them over the CI results as the newest source.
- If `gh` fails or is offline, `resultsError` is set, test criteria are `unknown`, and nothing is
  marked done on a guess. Sign-offs and branches still compute.
- `.gitignore` gains `.cache/` and `reports/`.

### 1.4 Size limit

Decided: **18,000 words** for the whole plan. A word is a `\S+` token in `_header.md` + `NN-*.md`
after stripping front matter, directive lines and HTML tags. Diagrams and README are excluded.
The live page is ~13,450 words and the done-whens below add ~3,000, which leaves room for about
1,500 more words of ideas before something has to be tightened. The lint prints the count.

### 1.5 No dated notes

The lint scans the section files and `_header.md`. It skips inline code spans, fenced code, text
inside double quotes (`"…"` or `“…”`), and a commit citation matching
`` `[0-9a-f]{7,40}` \(\d{4}-\d\d-\d\d ``. It fails on:

- ISO dates `\b(19|20)\d\d-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?\b`
- month-name dates `\b(Jan(uary)?|Feb(ruary)?|Mar(ch)?|Apr(il)?|May|June?|July?|Aug(ust)?|Sep(t(ember)?)?|Oct(ober)?|Nov(ember)?|Dec(ember)?)\.? \d{1,2}(st|nd|rd|th)?,? \d{4}\b` and `\b\d{1,2} (same months) \d{4}\b`
- phrases (case-insensitive, word-bounded): `previously`, `formerly`, `used to`, `update:`,
  `updated:`, `edit:`, `as of`, `a previous version`, `an earlier version`, `earlier draft`,
  `changelog`, `was changed to`, `(new)`, `(updated)`, `NEW:`

The error names file, line and match.

### 1.6 The checks (`scripts/plan/lint.mjs`, run by `pnpm test` and CI)

`export function lintPlan(root) → { errors: string[], words: number }`. Each error has the shape
`docs/plan/<file>:<line>: <message>`.

1. **Structure**: `_header.md` exists with its four keys. The section files are `NN-<id>.md`, NN
   contiguous from 00. The front matter has exactly id/nav/part. Ids are unique `[a-z]+` and match
   the filename. There is exactly one `##`, and it is the first content line.
2. **Directives**: only the §1.1 set; balanced; `::: diagram <name>` files exist; every file in
   `diagrams/` is referenced exactly once.
3. **Raw HTML**: only the §1.1 allowlist, checked outside code spans.
4. **Items**: grammar per §1.1. Ids are unique. Items and milestone headings appear only in
   `15-milestones.md`. There is a done-when on every item and exit, with criteria sequential from
   (a), 1–6 of them, at most one sign-off, and each test criterion at least 6 words. Exits exist for
   M0–M5 only.
5. **Orphan tags**: every tag in test sources (`**/*.{test,spec}.{ts,tsx,js,mjs}` and
   `android/**/src/{test,testDebug,androidTest}/**/*.kt`, skipping `node_modules`, `build`,
   `.claude/worktrees` and `scripts/plan/fixtures`) names an existing item and an existing
   **test** criterion letter.
6. **Size**: `words ≤ 18000`.
7. **No dated notes**: §1.5.
8. **Outbox**: every `docs/outbox/*.md` except `README.md` has a `# ` title as its first line, then
   within its first 6 lines `^kind: (product call|name|published|irreversible|physical)$` and
   `^default: \S.*$`.

`scripts/plan/lint.test.mjs` (node:test) has one test named `[M0.plan/a] the real plan passes
every check`, which asserts `lintPlan(repoRoot).errors` is `[]`. It prints the word count. The
same file has one unit test per rule against synthetic trees built in `os.tmpdir()`, each showing
the rule fails on a bad input and passes on a good one. Committed fixtures, where they're needed,
live in `scripts/plan/fixtures/` and use real-looking ids.

`package.json`:
`"test": "vitest run && node --test scripts/*.test.mjs scripts/plan/*.test.mjs"`.

`ci.yml` unit job: replace `pnpm test` with these steps.

```yaml
- run: pnpm exec vitest run --reporter=default --reporter=junit --outputFile.junit=reports/junit/vitest.xml
- if: always()
  run: node --test --test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=reports/junit/node.xml scripts/*.test.mjs scripts/plan/*.test.mjs
- if: always()
  run: node scripts/plan/collect-results.mjs --workflow ci --job unit --out reports/plan-results.json reports/junit/*.xml
- if: always()
  uses: actions/upload-artifact@v4
  with: { name: plan-results-ci-unit, path: reports/plan-results.json, if-no-files-found: warn }
```

Add a YAML comment saying the two test globs must match `package.json`'s `test` script.
`.prettierignore` gains `docs/plan/`, with a comment: the plan's own lint is its formatter, and
prettier's table realignment would turn one-word edits into whole-table diffs.

### 1.7 Modules and CLIs (all plain `.mjs`, no build step)

| File | Exports / CLI |
|---|---|
| `scripts/plan/parse.mjs` | `loadPlan(planDir) → { header, sections:[{file,id,nav,part,number,markdown}], milestones:[{id:'M0',title,items:[{id,text,doneWhen,criteria:[{label,text,kind:'test'\|'signoff'}],isExit,file,line}]}] }`; pure, throws `PlanParseError` with file:line |
| `scripts/plan/lint.mjs` | `lintPlan(root)`; CLI `node scripts/plan/lint.mjs` prints errors + word count, exit 1 on errors |
| `scripts/plan/results.mjs` | `parseJUnit(xml) → [{name,status}]`, `tagOf(name) → {item,criterion}\|null`, `loadResults({root, mode, exec}) → {sources, tests, error}` (§1.3). `exec` is injectable so tests never touch the network or real `gh` |
| `scripts/plan/collect-results.mjs` | CLI only (§1.3) |
| `scripts/plan/progress.mjs` | `computeProgress({root, results:'ci'\|'local'\|'none', exec}) → Progress`; `formatSummary(Progress) → string`; CLI `node scripts/plan/progress.mjs --summary [--local\|--no-results]` or `--json` |
| `scripts/plan/render.mjs` | `renderPlan({root, progress, stamp}) → html` (pure, given its inputs); CLI below |
| `scripts/plan/record-publish.mjs` | CLI: `--artifact plan --url <url> --version <v> --stamp build/plan/stamp.json`, merges into `design/published.json` |

`Progress` (JSON-serialisable; the later session-start hook consumes exactly this):

```
{ commit, commitDate, results: { sources:[{workflow, runId, commit, behind}], error|null },
  milestones:[{ id, title, done:n, total:n, items:[{ id, text, status:'done'|'failing'|'open',
    inProgress:bool, branches:[{name, note}], criteria:[{label, text, kind, status, tests:[name]}] }] }],
  current:'M0'|null, next:{id,text}|null, inFlight:[{item, branch, note}],
  failing:[{item, criterion, tests:[name]}],
  outbox:[{file, title, kind, default}], overAsking: outbox.length > 5,
  decisions:[{sha, date, text}], sortedIdeas:[{sha, date, file, plan}] }
```

- `decisions`: the last 8 `^Decision: (.+)$` lines from commit bodies
  (`git log -n 300 --format=%H%x1f%cs%x1f%B%x1e`), newest first.
- `sortedIdeas`: the last 8 commits that deleted a `docs/inbox/*.md` other than README
  (`git log -n 300 --diff-filter=D --name-only --format=… -- docs/inbox`), with that commit's
  `Plan:` line.
- `--summary` prints at most 25 lines, in this shape:

```
Auralis plan · current M0 Foundations · 3/13 done · checks from ci@1a2b3c4 (2 behind HEAD)
Next: M0.schema: zod → OpenAPI → generated TS and Kotlin clients, enforced in CI.
In flight: plan/M0.record: "scrubber done; next: Jellyfin recordings"
Failing: M0.plan (b): [M0.plan/b] renders badges
Waiting on you (1): Spotify reference screenshots in the public repo? (default: they stay out of git)
Recent decisions: 1a2b3c4 Keep the screenshots local · …
```

  When `results.error` is set, the first line says `checks unavailable: <reason>`. When over-asking,
  it adds `More than five open outbox items: sessions are over-asking.`

### 1.8 The renderer

`node scripts/plan/render.mjs [--out build/plan/index.html] [--results ci|local|none] [--draft]`

- **Inputs**: `docs/plan/_header.md`, `docs/plan/NN-*.md`, `docs/plan/page.css`,
  `docs/plan/diagrams/*.svg`, `docs/outbox/*.md`, git (HEAD sha, commit date, `HEAD:docs/plan` tree
  hash, log), and `computeProgress()`.
- **Refuses** (exit 1) if `lintPlan` has errors, or, without `--draft`, if
  `git status --porcelain -- docs/plan docs/outbox scripts/plan` is non-empty.
- **Outputs**: `build/plan/index.html` (one self-contained file, already gitignored via `build/`)
  and `build/plan/stamp.json` =
  `{ "commit": "<sha40>", "tree": "<HEAD:docs/plan tree sha>", "renderedAt": "<ISO UTC>", "draft": false }`.
- **HTML**: starts `<!doctype html>`, then reproduces the live skeleton exactly: `<html lang="en"
  data-theme="dark">`, the same head (charset, viewport, `<title>` from header, the two Google Fonts
  links), and `<style>` containing `page.css`. Then `.shell` > `nav.rail` (brand, brand-sub, a `Now`
  link `<a href="#now"><span class="n">·</span>Now</a>`, then the part groups with numbered links) >
  `main` > `header` (eyebrow, h1, `<p class="muted">` intro) > the generated `<section id="now">` >
  the part heads and sections > `<footer class="stamp">`. There are no scripts.
- **`#now` section** (generated, not source):
  - `::: callout warn`-styled box, "Waiting on you". Each outbox item renders as
    `<li><b>title</b> <span class="pill t-req">kind</span> Default: default</li>`, plus the
    over-asking line if needed. With no items it renders as a plain `callout`: "Nothing is waiting on you."
  - `grid g2` with two cards. **Progress**: current milestone, `M0 3/13 · M1 0/7 …`, next item,
    in-flight branches with notes, failing criteria, and the results source line.
    **Recent decisions**: `<code>sha7</code> date text`, then an h4 "Recently sorted ideas" with
    `inbox-file → Plan ids`.
- **Milestones**: each block renders as the live `.ms` markup: `<div class="ms"><div class="tag">M0</div><div class="card"><h4>Foundations</h4><ul class="small">…</ul><div class="exit">…</div></div></div>`.
  - Each item renders as `<li id="M0.schema"><span class="iid">M0.schema</span>{badge}{text}<div class="dw"><b>Done when</b> {criteria}</div></li>`.
  - Each criterion's label `(a)` gets class `c-pass`, `c-fail` or `c-open`.
  - Badge: done → `<span class="pill t-lib">done</span>`; failing →
    `t-err failing`; in progress → `t-prog in progress`; next → `t-req next`; otherwise none. A
    non-done item with some passed criteria also shows `2/4`.
  - The exit renders as `<div class="exit"><b>Done when</b> {text} {badge}</div>` plus
    `<div class="dw">Checked by Sofia's sign-off</div>` (or its criteria, if they aren't only a
    sign-off).
  - Milestone headings get the `.ms` tag, never `style=` attributes.
- **Tables** are wrapped in `<div class="tw">`.
- **Footer**: `Rendered from patakihara/curly-spoon at <a href="https://github.com/patakihara/curly-spoon/commit/<sha40>"><code>sha7</code></a> · <commit date> · plan tree <code>tree7</code> · checks from <sources or "unavailable">`, plus ` · draft, uncommitted changes` when `--draft`.
- **page.css** = the live lines 11–109 verbatim, followed by this appended block:

```css
/* Plan progress and stamp, generated by scripts/plan/render.mjs */
header p.muted{margin-top:10px}
.grid + p.small.muted{margin-top:12px}
.iid{font:600 11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--surface-fg-muted);margin-right:6px}
.ms li .pill{margin-right:6px}
.dw{font-size:12.5px;line-height:1.45;color:var(--surface-fg-muted);margin:2px 0 6px}
.dw .c-pass{color:var(--tone-library);font-weight:700}
.dw .c-fail{color:var(--tone-error);font-weight:700}
.dw .c-open{font-weight:700}
footer.stamp{margin-top:48px;padding-top:16px;border-top:1px solid var(--surface-border);font-size:12px;color:var(--surface-fg-muted)}
```

  These replace the live page's two inline `style=` uses (the header paragraph, and the "Also
  carried over" paragraph after the decisions grid). The milestone h4 `margin-top:0` is already
  covered by `.card h4`.

Tests (`scripts/plan/render.test.mjs`, `progress.test.mjs`, `results.test.mjs`) build a fixture
git repo in `os.tmpdir()` (a small plan, one outbox file, commits with `Decision:` lines, a
`plan/M0.aa` branch with a description, a `signoff/M0.exit` tag) and inject a fake `exec` for
`gh`. They must tag:

- `[M0.plan/b]`: the render has a done badge, an in-progress badge with its note, a next badge,
  the waiting-on-you item, a decision line and the footer sha.
- `[M0.plan/c]`: `progress.mjs --summary` on the fixture prints the current milestone, done count,
  next, in flight, failing, outbox and decisions lines. With `gh` failing, it prints
  `checks unavailable` and marks nothing done.
- `[M0.plan/d]`: in the real repo, `design/published.json`'s `plan.tree` equals
  `git rev-parse HEAD:docs/plan`. This fails until the first publish, and again whenever the plan
  changes without being republished, which is intended.
- Untagged unit tests: the JUnit parser (vitest, node, and Gradle shapes), both tag spellings,
  status precedence, current/next selection, and the exit counting last.

### 1.9 Publishing (orchestrator only; subagents never publish)

1. Everything is committed and pushed to `origin/main`, so the footer link resolves.
2. `node scripts/plan/render.mjs`. It prints `build/plan/index.html` and the stamp.
3. `Artifact` `action: read`, `url: https://claude.ai/artifact/81FfkqDpQSEe2VwYcT1sjq`. The tool
   requires it, and the plan requires "your side is read first". If Sofia edited the page or left
   comments since the recorded version, fold them into `docs/plan` (or file them to the inbox),
   commit, and go back to step 1.
4. `Artifact` publish: `file_path: <repo>/build/plan/index.html`,
   `url: https://claude.ai/artifact/81FfkqDpQSEe2VwYcT1sjq`, `label: "plan <sha7>"`. No icon, no
   description change.
5. `node scripts/plan/record-publish.mjs --artifact plan --url https://claude.ai/artifact/81FfkqDpQSEe2VwYcT1sjq --version <version from the publish result> --stamp build/plan/stamp.json`.
6. `git commit -m "Publish the plan at <sha7>" -m "Plan: M0.plan" -- design/published.json && git push`.

`design/published.json` shape, with one key per artifact holding only the latest publish (git
history is the record):

```json
{
  "plan": {
    "url": "https://claude.ai/artifact/81FfkqDpQSEe2VwYcT1sjq",
    "source": "docs/plan",
    "commit": "<sha40 rendered>",
    "tree": "<HEAD:docs/plan tree sha>",
    "version": "<as given by the Artifact publish result>",
    "publishedAt": "<ISO UTC>"
  }
}
```

Design publishes add sibling keys (`sonora`, `canvas`) with the same fields, with `source` set to
`design/sonora` or `design/app`. The later merge check compares `git rev-parse HEAD:<source>` to
`tree`. The build agent creates the file as `{}` plus a newline; `record-publish.mjs` keeps keys
sorted and writes 2-space JSON with a trailing newline.

`docs/plan/README.md` is rewritten (it replaces the one-line stub) to cover: what the folder is,
the file layout, the item and criterion grammar, the two tag spellings, the sign-off tag,
`plan/<ID>` branches with descriptions, the four commands (`lint`, `progress --summary`, `render`,
the publish steps), and the 18,000-word limit. Keep it under 120 lines.

---

## 2. Migration: live HTML → Markdown

Mechanical. **No rewording** except the edits listed in §2.3 and the milestone items in §3.

### 2.1 Files

| File | id | nav | part | live lines |
|---|---|---|---|---|
| `00-tldr.md` | tldr | The short version | Why and what | 151–164 |
| `01-state.md` | state | Where it stands | Why and what | 166–183 |
| `02-spotify.md` | spotify | Replacing Spotify | Why and what | 185–200 |
| `03-fixed.md` | fixed | Your decisions | Why and what | 202–253 |
| `04-play.md` | play | Playback & queues | The product | 257–311 |
| `05-library.md` | library | Library & accounts | The product | 313–340 |
| `06-get.md` | get | Getting things | The product | 342–421 |
| `07-youtube.md` | youtube | YouTube shows | The product | 423–445 |
| `08-discover.md` | discover | Discovery | The product | 447–514 |
| `09-search.md` | search | Search & lyrics | The product | 516–525 |
| `10-arch.md` | arch | Architecture | How it's built | 529–600 |
| `11-api.md` | api | API surface | How it's built | 602–617 |
| `12-front.md` | front | Design & frontend | How it's built | 619–718 |
| `13-enforce.md` | enforce | Staying on track | How it's built | 720–792 |
| `14-process.md` | process | How the work runs | How it's built | 794–816 |
| `15-milestones.md` | milestones | Milestones | Delivery | 820–915 |
| `16-salvage.md` | salvage | Keep or rewrite | Delivery | 917–942 |
| `17-questions.md` | questions | Still open | Delivery | 944–954 |
| `18-unverified.md` | unverified | Not verified | Delivery | 956–end of `</main>` |

Line numbers are approximate; each section runs from its `<section id=…>` to its `</section>`.
Diagrams: the `<svg>` in `play`, `get`, `discover` and `arch` goes, verbatim, to
`diagrams/play.svg`, `get.svg`, `discover.svg` and `arch.svg`, each with its original
`<svg …>…</svg>` only (no wrapper div). Keep the marker ids (`ar`, `ar2`, `ar3`, `ar4`) as they are.

### 2.2 Element mapping

| Live | Markdown |
|---|---|
| `<b>x</b>` / `<i>x</i>` | `**x**` / `_x_` |
| `<code>x</code>` | `` `x` `` with entities decoded (`&lt;` becomes `<`, `&amp;` becomes `&`). Inside table cells, escape `\|` |
| `<a href="u">t</a>` | `[t](u)` |
| `<br>` | a trailing `\` then a newline |
| `&nbsp;` | keep `&nbsp;` |
| `<span class="pill t-x">y</span>` | verbatim |
| `<h3>` / `<h4>` | `###` / `####` |
| `<ul>` / `<ol>`, nested | `-` / `1.` lists, nested with 2 (ul) or 3 (ol) spaces |
| `<table>` | GFM table; the header row comes from the `<th>` row. The one cell holding a `<ul>` (discover's phase-2 row) keeps inline `<ul><li>…</li></ul>` with the inner `<b>` as `**` |
| `div.hero > ol` | `::: hero` + `1.` list |
| `div.grid.gN > div.card` | `::: grid gN` › `::: card` › `#### title` + content |
| `p.lede` / `p.cap` / `p.small.muted` (with or without `style=`) | `::: lede` / `::: cap` / `::: small muted` |
| `div.callout[.warn]` | `::: callout[ warn]` |
| `div.diagram` | `::: diagram <name>` |
| `div.eyebrow`, `section`, `.part-head`, nav, `.ms` markup | not in source (generated) |
| `<div id="reco">` | dropped (nothing links to it); its contents stay in place |

### 2.3 Sanctioned text edits (the complete list)

1. **Date removals** (dated-notes check):
   - `03-fixed`: "(researched from its source on 2026-08-06, at your request)" becomes
     "(researched from its source, at your request)".
   - `03-fixed`: "All checked live 2026-09-27." becomes "All checked live."
   - `08-discover`: "all checked live on 2026-09-27:" becomes "all checked live:".
   - The header's `` `781efd4` (2026-08-21, … `` stays as it is (commit-citation exemption).
     `~/auralis-notes-2026-09-27.md` stays as it is (code span).
   - The rail brand-sub date is generated (§1.1).
2. **Fact (b), Spotify screenshots and Sonora authors private**: in `03-fixed`, card "Design",
   append this list item after the "One Auralis repo…" item:
   `- **Some design inputs stay private.** The Spotify reference screenshots and the original Sonora author identities stay out of the public repo. The screenshots stay on the ThinkPad, gitignored.`
   (`M0.repo` below also carries it.)
3. **Fact (a), carry over on first use**: in `16-salvage`, directly under `## Keep or rewrite` and
   before the grid, insert
   `Each carried-over part is taken from the git tag `legacy` at the start of the plan item that uses it, not up front.`
   (with `legacy` in backticks).
4. **Fact (c), old code at `legacy`**: carried by `M0.repo`'s text below. "No scars" already says
   "(kept only at the `legacy` tag)"; leave it.
5. **Milestones**: replace the live milestone lists and exits with §3 exactly. The milestone intro
   paragraph stays verbatim.

### 2.4 Verifying the migration (build agent, before committing; nothing permanent)

- As a throwaway script in `/tmp`: take the text content of the live `<main>` (dropping `<svg>`),
  and of the rendered `build/plan/index.html` `<main>` (dropping `<svg>`, `#now`, `.iid`, `.dw`,
  `.pill` badges inside `.ms`, and `footer`). Normalise whitespace and diff word by word. The only
  differences allowed are §2.3 and §3. Put the diff in the report.
- Playwright screenshots (a throwaway script in `/tmp`, run through the repo's installed
  Playwright) of the live file and the rendered file, at 1280×900 full-page and 390×844. Check that
  section spacing, cards, tables, the hero list, diagrams and the rail match, and put two sentences
  on differences in the report. Delete the throwaway scripts.

---

## 3. Milestone items: copy exactly into `15-milestones.md`

These keep the live bullets' words. Compound bullets are split at sentence or clause boundaries so
each item has one check set. The edits beyond splitting: M0.repo (facts b/c), M0.guards'
lead-in, and M1.gapless, M3.* and M5.* capitalised after a split.

```markdown
### M0 · Foundations

- **[M0.repo]** The rebuild happens **in the same GitHub repository** (`patakihara/curly-spoon`), so the F-Droid repository address, the signing secrets and the release workflows carry over untouched. The old code stays at the git tag `legacy`, read-only. New layout: `server`, `web`, `android`, `schema`, `design/sonora` (moved in from the ThinkPad with its history, minus the Spotify reference screenshots and the original Sonora author identities, which stay out of the public repo), `design/app` and `docs/plan`.
  _Done when:_ (a) a test asserts the tag `legacy` exists and `main` has the top-level folders `server`, `web`, `android`, `schema`, `design/sonora`, `design/app` and `docs/plan`, and none of the legacy tree's `apps/` or `packages/`; (b) a test asserts nothing under `design/sonora/assets/reference/spotify/` is tracked, that path is gitignored, and every commit touching `design/sonora` has an author in the repo's allowed identity list.
- **[M0.fdroid]** The first real Android build is released through the F-Droid repository and installed over 0.2.0 as an update, proving the path end to end.
  _Done when:_ (a) a live test reads the F-Droid repository's `index-v2.json` and asserts `net.develivarr.auralis` at a version code above 0.2.0's, with an APK URL that answers 200; (b) Sofia's sign-off: it installed on her phone over 0.2.0 without uninstalling.
- **[M0.schema]** zod → OpenAPI → generated TS and Kotlin clients, enforced in CI.
  _Done when:_ (a) a test regenerates the OpenAPI document and both clients from `schema/` and fails on any difference from what is committed; (b) a test adds a field to a zod schema in a temporary copy and asserts it appears in both the generated TS and Kotlin clients.
- **[M0.record]** Adapter record mode; the first recordings from mediaserver's Audiobookshelf and Jellyfin, with secrets scrubbed.
  _Done when:_ (a) a test runs an adapter in record mode against a local fake upstream and asserts it writes the request and response as a recording; (b) a test asserts recordings from mediaserver exist for Audiobookshelf's library list, item detail and play calls and Jellyfin's library list and item detail; (c) a test scans every committed recording and fails on any token, API key, cookie, password or real hostname.
- **[M0.security]** Security baseline: one-time setup, admin role, cookie and proxy config.
  _Done when:_ (a) a test calls setup twice and asserts the second call is refused without an admin session; (b) a test asserts every admin route rejects a signed-in non-admin user; (c) a test asserts the session cookie is `HttpOnly`, `Secure` and `SameSite=Lax`, and forwarded headers are trusted only from the configured proxy.
- **[M0.sso]** **Multi-user from day one**: an `auralis` OpenID Connect client in the household sign-on (Authelia, backed by LLDAP), sign-in mapped by username to each person's Audiobookshelf and Jellyfin accounts, and device registration. How Auralis gets a per-user Audiobookshelf and Jellyfin token without asking for their password again is settled first.
  _Done when:_ (a) a test signs in through a recorded OpenID Connect exchange and asserts the username maps to that person's Audiobookshelf and Jellyfin accounts; (b) a test registers two devices for one user and asserts each gets its own device id; (c) a test asserts two users' upstream calls each carry their own token, never the other's.
- **[M0.uikit]** **Sonora pipeline**: web UI package built from Sonora's components, Android props generated from the `.d.ts` files.
  _Done when:_ (a) a test rebuilds the web UI package and the Android props from `design/sonora` and fails on any difference from what is committed; (b) a test asserts every Sonora component with a `.d.ts` has a web export and a generated Kotlin props class.
- **[M0.guards]** Every check in "Staying on track": generated folders locked, publish stamps, the merge checks, the end-of-session and session-start hooks, and `Plan:` lines on commits.
  _Done when:_ (a) a test feeds the repo's Claude Code hook an edit to a generated folder and asserts it is refused; (b) a test asserts the merge check fails when `design/` or `docs/plan` differs from the tree recorded in `design/published.json`; (c) a test asserts the commit check rejects an app change without a `Plan:` line naming an existing item; (d) a test runs the session-start hook on a fixture repo and asserts it prints milestone, done items, work in flight, next step, failing checks and outbox; (e) a test asserts the end-of-session hook blocks while a design or plan change is unpublished.
- **[M0.canvas]** **The Auralis canvas** in `design/app`: `nav.json` plus the full screen map as pages, then Sonora pruned to what those pages use and reordered into its hierarchy. Generators for the web router, the Android nav graph and the pages, and their CI checks. **Both apps navigate the whole map with placeholder data** before any screen gets real content.
  _Done when:_ (a) a test asserts the web routes and the generated Android nav graph's destinations both equal the pages in `nav.json`; (b) a test asserts every Sonora component is used by at least one page; (c) a Playwright test visits every page in `nav.json` and asserts it renders with placeholder data; (d) an emulator test navigates to every destination in the Android nav graph.
- **[M0.tokens]** Sonora tokens generated for web (CSS) and Android (`SonoraTokens.kt`), fonts and icons; web gallery and Android Paparazzi screenshots in CI.
  _Done when:_ (a) a test regenerates the CSS tokens and `SonoraTokens.kt` from Sonora's token export, fails on any difference, and asserts both carry the same names and values; (b) a test asserts the container serves every font and icon itself, with no request to an outside host; (c) a Playwright gallery test and a Paparazzi test each produce a screenshot per component in CI.
- **[M0.plan]** This plan moved into `docs/plan` and published from there, with an id and a "done when" check on every item, the progress badges, and the session-start summary hook.
  _Done when:_ (a) a test runs the plan checks on `docs/plan` (unique ids, a done-when on every item, the size limit, no dated notes, the outbox format) and they pass; (b) a test renders a fixture plan and asserts the done, in-progress and next badges, the waiting-on-you box, recent decisions and the footer commit; (c) a test runs `progress.mjs --summary` on a fixture repo and asserts every summary line; (d) a test asserts `design/published.json` records the current tree of `docs/plan`.
- **[M0.staging]** The existing Auralis container on mediaserver (unused today) follows `main` as the test instance.
  _Done when:_ (a) a live test asserts the staging container's health endpoint reports the commit of the latest green `main` build within 30 minutes of its publish.
- **[M0.emulator]** The Android emulator in CI actually runs the app (a smoke test: log in, open Browse, play 5&nbsp;s).
  _Done when:_ (a) an emulator test in CI logs in against the server with recorded upstreams, opens Browse and asserts playback passes 5 seconds.

**[M0.exit] Done when** you sign in to the staging container with your Delivarr account, it reaches your own Audiobookshelf and Jellyfin, and both clients render the shell from generated types.
_Done when:_ (a) Sofia's sign-off.

### M1 · It plays

- **[M1.index]** Local index job for Audiobookshelf and Jellyfin.
  _Done when:_ (a) a test runs the index job on the Audiobookshelf and Jellyfin recordings and asserts every recorded book, show, episode, album and track is indexed with its upstream ids; (b) a test asserts a second run after a recorded change updates only the changed items.
- **[M1.play]** `POST /play` with direct play and a working HLS path.
  _Done when:_ (a) a test on the Audiobookshelf recording that answers with an HLS playlist asserts `POST /play` returns a plan whose URLs the server proxies, and a segment returns audio; (b) a test on a direct-play recording asserts the plan's track URLs answer range requests with 206.
- **[M1.gapless]** Gapless multi-file playback; chapters across files.
  _Done when:_ (a) a Playwright test plays a two-file fixture book and asserts the second file starts without a pause and position continues across the boundary; (b) an emulator test asserts the same on Android; (c) a test asserts chapters spanning files map to the right absolute positions in the playback plan.
- **[M1.progress]** Progress fan-out to Audiobookshelf and Jellyfin; bookmarks; speed; sleep timer; media session and notification controls.
  _Done when:_ (a) a test asserts one progress update reaches Audiobookshelf's and Jellyfin's recorded progress calls, with wall-clock listening time; (b) a test creates, lists and deletes a bookmark and sees each Audiobookshelf call; (c) a Playwright test asserts speed changes the playback rate, the sleep timer pauses playback, and Media Session metadata and actions are set; (d) an Android test asserts the same speed and sleep behaviour and the notification's play, pause and skip actions.
- **[M1.sessions]** Per-device listening sessions, stored on the server and never mixing by default. Their queues: music plus the shared spoken queue, the meta-queue switch, YouTube Music style with Spotify style as an option, history-based Back, default button actions, and autoplay (next episode, next in series, album then radio).
  _Done when:_ (a) a test asserts two devices of one user keep separate sessions and queues on the server; (b) a test asserts the music and spoken queues advance independently and the meta-queue switch changes which one the controls drive; (c) a test asserts YouTube Music style and Spotify style insert "play next" items in their documented orders; (d) a test asserts Back returns to the previously played item across both queues; (e) a test asserts autoplay continues with the next episode, the next book in the series, and the rest of the album followed by radio.
- **[M1.shell]** Sonora shell, mini-player, Now Playing (stacked), queue, synced lyrics (Jellyfin's own for now); basic Books, Podcasts and Music lists to start playback from.
  _Done when:_ (a) Playwright screenshot tests of the shell, mini-player, Now Playing, queue and lyrics match their canvas renders in each recorded state; (b) Paparazzi tests of the same screens match the same canvas renders; (c) a test asserts synced lyrics highlight the current line from Jellyfin's recorded lyrics; (d) web and Android tests each start playback from the Books, Podcasts and Music lists.
- **[M1.android]** Android: background playback, and Android Auto browse for all three media (continue, books, shows, albums).
  _Done when:_ (a) an emulator test asserts playback continues for 60 seconds with the app in the background and the screen off; (b) a Robolectric test asserts the Auto browse roots are continue, books, shows and albums, each listing recorded items.

**[M1.exit] Done when** you listen for a week, on phone and desktop, and resume across both without thinking about it. This also replaces the ABS app for you.
_Done when:_ (a) Sofia's sign-off.

### M2 · My library

- **[M2.screens]** Library homes and every detail screen (book, show, episode, album, artist, author, series, playlist, favourites), drawn on the canvas first where Sonora lacks them.
  _Done when:_ (a) a test asserts each of these screens is a page in `design/app` and a route in both apps; (b) Playwright screenshot tests render each screen's loading, empty, full and error states and match the canvas; (c) Paparazzi tests render the same states and match the canvas.
- **[M2.search]** Search: suggestions plus library results with relevance ranking; context menus (Play next, Play last, Go to album or artist).
  _Done when:_ (a) a test asserts `GET /search/suggest` returns suggestions from the index for a two-letter prefix; (b) a test asserts an exact title match ranks above partial matches in library results; (c) a Playwright test uses Play next, Play last and Go to album or artist from a result's menu; (d) an Android test does the same.
- **[M2.lrclib]** LRCLIB lyric backfill and cache.
  _Done when:_ (a) a test on an LRCLIB recording asserts a track without Jellyfin lyrics gets synced lyrics stored in the cache; (b) a test asserts a second request for those lyrics makes no LRCLIB call.
- **[M2.downloads]** Android downloads (whole plan: every file of a book), with a Downloads screen.
  _Done when:_ (a) a test asserts downloading a multi-file book fetches every file in its playback plan; (b) an emulator test plays a downloaded book offline across a file boundary; (c) a Paparazzi test of the Downloads screen matches the canvas.
- **[M2.lists]** Listening lists, podcast playlists, The Digest and custom digests.
  _Done when:_ (a) a test creates a listening list and a podcast playlist through the API and plays each in order; (b) a test asserts The Digest holds the new unplayed episodes of subscribed shows by its rule in "Lists that aren't queues"; (c) a test creates a custom digest from chosen shows and asserts its episodes.
- **[M2.grid]** Library grid/list with Random sort; Up next and second-most-recent on Browse (from owned content).
  _Done when:_ (a) web and Android tests switch a library between grid and list and apply Random sort with a fixed seed; (b) a test asserts Browse's Up next and second-most-recent shelves hold only owned items from the user's history.
- **[M2.settings]** Settings, including accent picker, theme, queue style and autoplay switches.
  _Done when:_ (a) a test round-trips every setting through `GET/PUT /settings`; (b) web and Android tests change accent, theme, queue style and autoplay and assert each takes effect.

**[M2.exit] Done when** you can find and play anything you own faster than in Spotify, Audiobookshelf or Jellyfin's own apps.
_Done when:_ (a) Sofia's sign-off.

### M3 · Play or get anything

- **[M3.requests]** The unified request pipeline and status vocabulary.
  _Done when:_ (a) a test drives one request per medium through every status of the shared vocabulary on recorded upstreams; (b) a test asserts a failed step leaves the request in a named error status with its reason, and a retry resumes from that step.
- **[M3.timing]** Books: first, time each step of today's pipeline on a real request to find what's slow.
  _Done when:_ (a) a test asserts a committed timing recording from a real request covers the Prowlarr search, the download, the import and the scan.
- **[M3.books]** Then Prowlarr and AudiobookBay (real tracker rows, recorded markup), qBittorrent, and the import job that replaces the four `audiobook-*` commands (folder layout, clean titles, narrator only where needed, series, author photo), with Audiobookshelf picking up just the new folder.
  _Done when:_ (a) a test on Prowlarr and AudiobookBay recordings picks the expected release; (b) a test on a qBittorrent recording adds the torrent and follows it to completion; (c) a test imports a fixture download and asserts folder layout, clean title, narrator only where needed, series and author photo; (d) a test asserts Audiobookshelf is asked to pick up only the new folder, never a full scan.
- **[M3.ytmusic]** Music: YouTube Music adapter (extractor in the container, daily update and canary), search, instant streaming with a disk cache.
  _Done when:_ (a) a test on YouTube Music recordings returns search results and a stream the server proxies; (b) a live canary test resolves and plays 10 seconds of a known track from this server; (c) a test asserts a second play of a track is served from the disk cache with no upstream call; (d) a test asserts the extractor update job runs daily and records the version it installed.
- **[M3.keep]** Songs: _Add to library_ in the song menu and automatically at ~90% played, saved as the original Opus with MusicBrainz tags, then a Jellyfin refresh.
  _Done when:_ (a) a test asserts Add to library saves the original Opus stream unchanged, with MusicBrainz tags; (b) a test asserts a track played past 90% is kept automatically, once; (c) a test asserts a Jellyfin library refresh follows each save.
- **[M3.albums]** Albums: always a lossless torrent via Prowlarr → qBittorrent, with multi-query search, release scoring, a one-tap picker for unclear matches and Auralis's own tagging import, replacing any kept songs from that album on arrival.
  _Done when:_ (a) a test on Prowlarr recordings runs several queries and ranks lossless releases by the scoring rules; (b) a test asserts an unclear match produces a picker choice instead of a download; (c) a test imports a fixture album with Auralis's tagging and asserts kept songs from that album are replaced.
- **[M3.spotify]** Spotify playlist import (read the public playlist, resolve each track on YouTube Music), as AbleMusicPlayer does.
  _Done when:_ (a) a test reads a recorded public Spotify playlist, resolves each track to a YouTube Music id and reports the unmatched ones; (b) a test asserts the imported playlist plays in its original order.
- **[M3.podcasts]** Podcasts: subscribe or unsubscribe through PodcastIndex/iTunes search; greyed-out episodes that subscribe you when played.
  _Done when:_ (a) a test searches recorded PodcastIndex and iTunes results and subscribes and unsubscribes through Audiobookshelf's recorded calls; (b) a test plays a greyed-out episode of an unsubscribed show and asserts the subscription is created.
- **[M3.ytshows]** YouTube channels as audio-only shows, through the generated feed, with SponsorBlock segments cut from the files and skipped live, and per-show category settings, once a test channel has run through stubs, hydration and playback.
  _Done when:_ (a) a test asserts a channel's generated feed lists audio-only enclosures and no video; (b) a test cuts SponsorBlock segments from a fixture file and asserts the new length, and that live playback skips the segments; (c) a test asserts per-show category settings choose which segments are cut; (d) a live test runs the test channel through stubs, hydration and playback on staging.
- **[M3.ytsync]** Watched-state and position sync for YouTube shows, opt-in per person, starting with a test on your account: episodes of your YouTube shows marked played and resumed at the same spot both ways, nothing else from your YouTube history, each person's sync kept to their own account, and the "sign-in expired" warning.
  _Done when:_ (a) a test on recorded YouTube responses asserts played state and position sync both ways, only for channels added as shows; (b) a test asserts sync stays off until a person opts in and uses only that person's cookies; (c) a test asserts expired cookies show the "sign-in expired" warning; (d) Sofia's sign-off: sync works both ways on her account.
- **[M3.catalog]** Search's requestable section; artist and author catalogue with unowned titles greyed out (on by default, with a setting to hide it); Requests view; lyrics search.
  _Done when:_ (a) a test asserts search returns library and requestable results in separate sections and owned titles are never requestable; (b) web and Android tests render an artist and an author page with unowned titles greyed out, and hidden with the setting off; (c) web and Android tests render the Requests view with a request in each status; (d) a test on an LRCLIB recording finds a track from a line of its lyrics.

**[M3.exit] Done when** any song you think of plays within a couple of seconds, your Spotify playlists are imported and playing, and a lossless album you add arrives and replaces any songs you kept from it. Five books and two shows you request also turn into playable cards without you touching anything else.
_Done when:_ (a) Sofia's sign-off.

### M4 · Browse like Spotify

- **[M4.identity]** Identity fields end to end (ASIN, feed GUID, MBID).
  _Done when:_ (a) a test asserts the index stores ASIN, feed URL and GUID, and MusicBrainz ids from the recordings, and the generated client models expose them; (b) a test asserts an external candidate matches an owned item by identifier before title.
- **[M4.providers]** ListenBrainz (music), Audible similar products with an Audible-ID backfill (books), Apple Podcasts "You Might Also Like" (podcasts), YouTube Music radio, all as background jobs feeding the candidate pool.
  _Done when:_ (a) a test per provider, on its recording, asserts candidates land in the pool with their source and seed; (b) a test asserts the Audible-ID backfill finds ids by title and author for recorded books; (c) a test asserts serving Browse makes no provider call.
- **[M4.browse]** Browse composer: mixed shelves with context headers, one episode per show, feature cards with previews. External music plays straight away, external books and shows are requestable. Loading state held until ready. Plus the shelf review page.
  _Done when:_ (a) a test asserts composed shelves mix media, carry a context header and hold at most one episode per show; (b) a test asserts feature cards carry a playable preview; (c) web and Android tests assert Browse holds its loading state until every shelf has arrived; (d) tests assert external music plays directly and external books and shows open the request flow; (e) a test renders the shelf review page with each shelf's items and reasons.
- **[M4.reco]** Recommendation phases 1–2: history import (Spotify, YouTube Music takeout), co-occurrence and next-item tables, provider candidates scored against taste, source logging, and the held-out replay score. Phase 3's exploration share ships with Browse.
  _Done when:_ (a) a test imports fixture Spotify and YouTube Music takeout exports into the play-history table; (b) a test builds co-occurrence and next-item tables from fixture history and asserts known neighbours; (c) a test asserts candidates are ordered by taste score, not provider order, with their source logged; (d) a test computes the held-out replay score on fixture history and asserts it beats a random ordering; (e) a test asserts Browse includes the exploration share.
- **[M4.hardcover]** A short Hardcover check first: if its API exposes "readers also liked", it strengthens books.
  _Done when:_ (a) a test on a Hardcover recording asserts its "readers also liked" results enter the book candidate pool, or this item is removed with a `Decision:` line.

**[M4.exit] Done when** Browse puts at least one thing you didn't own, and then wanted, in front of you each week. That's the bar from your brief: _"cleverly serve me audiobooks it thinks i will enjoy."_
_Done when:_ (a) Sofia's sign-off.

### M5 · Everywhere, polished

- **[M5.auto]** Android Auto voice search and resumption on a real head unit or DHU.
  _Done when:_ (a) a Robolectric test asserts Auto voice-search queries resolve to playable items for each medium; (b) Sofia's sign-off: voice search and resumption work on a real head unit or the DHU.
- **[M5.offline]** Offline behaviour on Android: queue and progress catch-up after reconnecting.
  _Done when:_ (a) an emulator test plays offline, changes the queue, reconnects and asserts the server has the new progress and queue; (b) a test asserts conflicting progress resolves to the most recent listen.
- **[M5.perf]** Performance budget on this box (RAM ceiling for the container, Lighthouse on phone).
  _Done when:_ (a) a test runs the container under a recorded load and asserts its memory stays under the ceiling set in the test; (b) a Lighthouse test on the mobile profile meets the budget for Browse and Now Playing.
- **[M5.contrast]** Contrast fixes for the accent presets that fail WCAG.
  _Done when:_ (a) a test computes every accent preset's text and UI contrast pairs in both web tokens and `SonoraTokens.kt` and asserts WCAG AA.
- **[M5.handoff]** "Continue here" and "Play on…" between a user's devices.
  _Done when:_ (a) a test moves playback from one device to another with Continue here and asserts position and queue carry over; (b) a test asserts Play on reaches the user's own other device and never another user's.
- **[M5.streaming]** A streaming-only account for people without a media server.
  _Done when:_ (a) a test signs in a user with no Audiobookshelf or Jellyfin account and asserts Browse, search and YouTube Music playback work and library screens show their empty state.

**[M5.exit] Done when** Spotify is uninstalled.
_Done when:_ (a) Sofia's sign-off.

### M6 · Later, and separate

- **[M6.readalong]** EPUB downloaded with the audiobook, read-along via cheap speech-to-text matched against a small window of the text.
  _Done when:_ (a) a test downloads a fixture book together with its EPUB; (b) a test aligns fixture narration to its text and asserts the highlighted sentence is within two seconds of the spoken position.
- **[M6.spotify]** Spotify: import your history, sync listening from Spotify, push the Auralis queue into a Spotify Jam if that's possible, browse public playlists.
  _Done when:_ (a) a test imports a fixture Spotify history export; (b) a test on Spotify recordings syncs recent plays into history; (c) a test browses a recorded public playlist; (d) a test pushes a queue into a recorded Jam session, or the Jam clause is removed with a `Decision:` line.
- **[M6.alternate]** Alternating two books in one generated queue.
  _Done when:_ (a) a test generates a queue from two books and asserts their chapters alternate.
- **[M6.lyricshot]** Lyric screenshot formatting.
  _Done when:_ (a) a test renders a lyric screenshot for chosen lines and matches the canvas render.
- **[M6.lbpersonal]** ListenBrainz personal recommendations (tier 2), if you create an account and connect Jellyfin scrobbling.
  _Done when:_ (a) a test on a ListenBrainz recording of personal recommendations adds them to the pool for that user only.
```

Hand-check against the grammar before committing. Every test criterion is at least 6 words. Some
criteria say "web and Android tests" in one criterion; that is deliberate, and both platforms tag
the same letter. (M6.alternate's single criterion is 12 words, so it passes.)

---

## 4. Build order for the agent (commit after each step; never push)

1. Create `scripts/plan/parse.mjs` and `lint.mjs` with their tests, TDD against synthetic trees.
2. Migrate: `docs/plan/_header.md`, `00`–`18`, `page.css`, `diagrams/`. Put in §3's milestone
   items. Make `lint.test.mjs`'s `[M0.plan/a]` pass, and put the word count in the report.
3. Create `results.mjs` and `collect-results.mjs` with tests.
4. Create `progress.mjs` with tests (the fixture git repo, fake `gh`).
5. Create `render.mjs` with tests. Render the real plan with `--draft --results none`, then do the
   §2.4 verification.
6. Create `record-publish.mjs`, `design/published.json` (`{}`), `docs/plan/README.md`, the
   `package.json` test script, the `ci.yml` unit job, `.gitignore` (`.cache/`, `reports/`) and
   `.prettierignore` (`docs/plan/`).
7. Run `pnpm format && pnpm lint && pnpm test`. `[M0.plan/d]` is expected to fail until the
   orchestrator publishes, so the agent marks it with `todo: 'passes after the first publish'`.
   The orchestrator removes the todo in the publish commit, before running step 6 of §1.9. (Todo,
   not skip, so it still reports as not passed.)
8. Every commit carries `Plan: M0.plan`, and path-limited commits (`git commit -- <paths>`).

**Do not touch**: `server/`, `web/`, `android/`, `schema/`, `design/sonora/`, `design/app/`,
`.github/workflows/{android,fdroid-repo,release,publish}.yml`, `.claude/`, `CLAUDE.md`,
`docs/inbox/`, `docs/outbox/` (read only), and anything outside the repo. No `pnpm install/add`,
no push, no `Agent` calls, no publishing. Keep context small: grep and `sed -n` over the live page,
never `cat` it whole, and run targeted `node --test scripts/plan/<file>.test.mjs` while iterating.

**Report**: branch and commit list, `git status --short`, the word count, the §2.4 text diff, two
sentences on the screenshot comparison, and any grammar case §3 didn't settle.

Out of scope, built later: the session-start hook, the commit-msg `Plan:` check, locked folders,
and the end-of-session check. They'll read `computeProgress()` / `progress.mjs --json`,
`design/published.json`'s `tree`, and `loadPlan()`, and need nothing else from this piece.
