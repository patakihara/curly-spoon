# docs/plan

The rebuild plan, and the only source of truth for what is being built and why. The published
plan page is generated from this folder; nobody edits the page. Progress is computed from the
repo (test results, sign-off tags, branches) and never written here. This README is not part of
the page and is excluded from every check.

## Layout

```
_header.md               title, eyebrow, brand, brand-sub, then `# <h1>` and the intro paragraph
00-<id>.md … NN-<id>.md  one file per page section, in page order, NN contiguous from 00
page.css                 the page's CSS, verbatim, plus the block the renderer's markup needs
diagrams/<name>.svg      inline SVGs, each used by exactly one `::: diagram <name>`
```

A section file opens with exactly this front matter, then its one `##` heading:

```
---
id: spotify
nav: Replacing Spotify
part: Why and what
---
## What replacing Spotify means
```

`id` is the anchor and matches the filename (`[a-z]+`). `nav` is the rail label. A new part
head and rail group start whenever `part` changes. The section number is NN, shown as the
eyebrow on every section but 00. Inside a section, `###` is h3 and `####` is h4; `#` belongs
only in `_header.md`. The rail's date is HEAD's commit date, never written in source.

## Markdown and directives

Plain GFM, plus a closed set of block directives: a line `::: <name>`, closed by a line `:::`,
nestable. `::: diagram <name>` stands alone with no body.

| Directive | Renders |
|---|---|
| `::: hero` | the numbered hero list (content is a `1.` list) |
| `::: grid g2`, `::: grid g3` | a two- or three-column grid |
| `::: card` | a card; its top-level lists and paragraphs get `class="small"` |
| `::: callout`, `::: callout warn` | a callout; a single paragraph is unwrapped |
| `::: small` | no wrapper; its top-level lists and paragraphs get `class="small"` |
| `::: lede`, `::: cap`, `::: small muted` | a paragraph with that class (a div if longer) |
| `::: diagram <name>` | `diagrams/<name>.svg`, inlined |

Raw HTML is limited to `<span class="pill t-lib|t-prog|t-req|t-err">…</span>`, and `<ul>`/`<li>`
inside a table row for a cell that holds a list. A table row whose trailing cells are empty
renders its last filled cell with a `colspan` over them, so one value can span several columns. A hard line break is a trailing `\`; `&nbsp;` works.

## Items and criteria

Items live only in the section with id `milestones`, after its intro paragraph:

```
### M0 · Foundations

- **[M0.schema]** zod → OpenAPI → generated TS and Kotlin clients, enforced in CI.
  _Done when:_ (a) a test asserts …; (b) a test asserts ….

**[M0.exit] Done when** you sign in to the staging container ….
_Done when:_ (a) Sofia's sign-off.
```

- `### M<n> · <title>`: M0 to M6, each once, in order.
- An item is one line, `- **[M<n>.<slug>]** <text>`, where the slug is `[a-z][a-z0-9]{1,15}`
  (no hyphens or underscores) and `M<n>` is its milestone. Its next line is
  `  _Done when:_ …`, indented two spaces.
- M0 to M5 each end with exactly one exit, `**[M<n>.exit] Done when** <text>` followed by
  `_Done when:_ …`. M6 has none.
- A done-when is `(a) text; (b) text.`: letters from (a) in order, 1 to 6 criteria.
- A criterion that begins `Sofia's sign-off` is a sign-off criterion, at most one per item.
  Every other criterion is a test criterion of at least 6 words.

## How a criterion is checked

- **Test criterion** `(x)` of `M1.play`: tests whose name carries its tag.
  - JS/TS (vitest, node:test, Playwright): `[M1.play/x]` anywhere in the full test name.
  - Kotlin/JVM: the method name starts `M1_play_x_`, e.g. `` fun `M1_play_d_second file follows first`() ``.
- **Sign-off criterion**: an annotated tag `signoff/<ID>` (for example `signoff/M0.exit`),
  created only when Sofia says so, with her words as the message, and pushed.

A criterion is `passed` (a tagged test passed, none failed), `failed`, `missing` (no tagged
test) or `unknown` (no results could be read). An item is `done` when every criterion passed,
`failing` when any failed, otherwise `open`. It is in progress while a branch `plan/<ID>` or
`plan/<ID>-<anything>` exists, locally or on origin; the branch description
(`git branch --edit-description`) is its where-I-stopped note. The current milestone is the
first with an item not done. Next is its first item neither done nor in progress; the exit
counts only once every other item is done.

Results come from CI: each test job writes JUnit XML, `scripts/plan/collect-results.mjs` keeps
the tagged tests, and the job uploads `plan-results-<workflow>-<job>`. Progress reads the
newest completed run per workflow that HEAD contains. Without `gh` or the network, test
criteria are `unknown` and nothing is marked done.

## Commands

```
node scripts/plan/lint.mjs                      every check, plus the word count (also in pnpm test)
node scripts/plan/progress.mjs --summary        the session summary; --local adds a local test run,
                                                --no-results skips results, --json prints everything
node scripts/plan/render.mjs [--draft]          build/plan/index.html and build/plan/stamp.json
```

The lint checks structure, directives, raw HTML, the item grammar, orphan test tags (every tag
names an existing item and test criterion), the size limit, dated notes, and the outbox format.
A dated note is an ISO or month-name date, or a history phrase such as "previously" or "as of";
code spans, quoted text and a commit citation like `` `781efd4` (2026-08-21 `` are exempt.
The render refuses on any lint error, and on uncommitted changes to `docs/plan`, `docs/outbox`
or `scripts/plan` unless `--draft`.

Publishing is the orchestrator's alone: commit the plan change on its branch, render from that
commit, read the artifact first and fold in any edits or comments, publish
`build/plan/index.html` to it, then
`node scripts/plan/record-publish.mjs --artifact plan --url <url> --version <v> --stamp build/plan/stamp.json`,
commit `design/published.json`, and push both commits together before merging. CI never sees a
plan change without its record. The page shows the outbox, so a `docs/outbox` change needs the
same publish: the recorded tree covers `docs/plan` and `docs/outbox` together.

## Size

The plan stays within 18,000 words: `\S+` tokens in `_header.md` and the section files, after
dropping front matter, directive lines and HTML tags. Diagrams and this README don't count.
