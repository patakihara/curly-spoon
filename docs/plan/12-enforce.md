---
id: enforce
nav: Staying on track
part: How it's built
---
## Staying on track, enforced

### Build through the design

- **Generated code can't be edited by hand.** The web UI package, Android's component props, the routes and the page layouts are generated from `design/`. CI fails on any difference from a regeneration, and a repo hook refuses edits there.
- **No component without a design.** CI fails if app code uses a component that doesn't exist in Sonora with its `.d.ts`, card and previews. Lint rejects styled elements, raw colours and one-off components outside the UI package, and from M5 (M5.strings, M5.formats, M5.icons) literal text, formatting or glyph names outside the string table, format spec and icon list; M5.sonoraclean's check refuses raw literals in Sonora and `ui/sonora`.
- **No screen without a page, and looks match:** see "From design to both apps".

### Keep the artifacts current

- **Every artifact says what it was built from.** Its footer shows the repo commit, and `design/published.json` records the commit and artifact version of each publish.
- **Unpublished design changes block the merge**, and a repo hook stops a session finishing with one.
- **Your side is read first.** Before touching `design/`, the session compares the live artifact with the recorded version, and your edits or comments since come first. Every session starts by listing open comments.

### Keep the plan clean and the progress true

::: grid g2
::: card
#### The plan: edited in place

- Lives in `docs/plan/`, published here with the design's commit stamp and merge check.
- Holds only current decisions, each rewritten where it stands, and nowhere else: no dated notes; git history says why it changed.
- Every item has an id and a concrete **done when**, and a size limit keeps it readable.
:::

::: card
#### The progress: computed, never written

- **Done**: every check tagged with the item's id passes; a sign-off is your git tag.
- **In progress**: a branch whose description says where it stopped and what's next, gone on merge.
- **Next**: the first unfinished item of the current milestone.
:::
:::

- **"What this plan hasn't verified" stays current.** Each line names the existing item whose work checks it. The session-start summary flags a line whose item is done, and the orchestrator drops it or cuts it to what's open. A gap a subagent reports but can't check is added, naming the item that will.
- **A new session knows where things stand**: a session-start hook prints the milestone, done items, work in flight, the next step, failing checks and your open comments.
- **You see it too**: the published plan badges each item done or in progress, computed at publish.
- **Every commit names its plan item** (a `Plan:` line); CI rejects app changes without one. Work not in the plan is added to it first, in the same commit.
- **Checked with you at every milestone.** The demo ends reading the plan through together, and the milestone gets your sign-off tag.

### No scars

- **Replacing something deletes the old thing in the same change, everywhere it lives:** code, config, containers, timers, settings, secrets, data folders, docs, map entries, memory notes, scripts on either host. No legacy folders, compatibility shims, commented-out code, "formerly" notes or backups. Git history is the only record.
- **The old Auralis goes completely.** Its code leaves `main` (kept at the `legacy` tag), and its leftovers on mediaserver and the laptop go once nothing uses them: the old container setup and data folder, the update timer, the old autorun machinery, old docs and map entries.
- **Checked before a milestone counts as done:** a sweep for references to removed things, unused files and settings, and orphaned containers or timers, on top of the dead-code lint.

### Your ideas, without derailing

Anything you say about Auralis takes one fixed path, each step safe to interrupt.

1. **Filed.** One file per idea in `docs/inbox/`: your words verbatim, where it came from, and the date. The session replies `Noted: <title>` (in the thread, for a comment) and carries on. Filing never touches the plan or the work in progress, unless you say "do it now", answer one of its outbox items, or tell the session itself to stop or pause.
2. **Sorted, at set moments:** each milestone demo, when you say "let's go through my ideas", or once about ten are waiting. The orchestrator hands each idea to a fresh subagent, which reads it and the whole plan and decides which it is:
   - **new work**: a new plan item, with an id and a concrete "done when", in the milestone where it belongs (usually a later one; the milestone in progress only takes small fixes to what it builds, or anything you pulled in);
   - **a change** to an existing item: that item is rewritten in place, including its "done when";
   - **a bug** in something done: a check that catches it is added to that item, which reopens it;
   - **already planned**: the existing sentence is sharpened if your words add something;
   - **a call only you can make**: an outbox item with its default, and the idea waits for your answer;
   - **a drop**: only with your OK, asked through the outbox.

   It also edits whatever else in the plan the change affects.
3. **Applied in one commit**: the plan edit, the inbox file's deletion, and a commit message naming the plan item and the inbox file. Until that commit lands the idea stays in the inbox, so a crash loses none.
4. **Closed the loop with you.** The plan page is republished, a comment thread gets a reply naming where the idea landed and is resolved, and the page and session-start summary list recently sorted ideas.

### What needs you, without waiting on you

**The session doing the work decides almost everything.** The outbox (`docs/outbox/`) holds only what genuinely needs you.

- **Five kinds only:** a product call that passes your test ("would she have an opinion, and does the answer change what she gets?"); a name; anything published or shared beyond the machines; anything destructive or irreversible; something only you can physically do (try a milestone build, sign off, export YouTube cookies, test in the car).
- **Every item carries its default**, and work goes ahead on it: a working name gets used until you rename it, a product call gets the session's best choice, yours to overturn. Only irreversible or outward-facing actions wait for your answer.
- **Kept small by checks.** An item without its kind and default is rejected. Over about five open items means sessions over-ask, and the session-start summary says so. Answered items are deleted.
- **Decisions made for you are visible, not queued.** They're written into the plan, their commits carrying a `Decision:` line. The session-start summary and this page list recent ones; overruling one is saying so.
- **Where you see it:** a "waiting on you" box at the top of this page, in every session's opening summary, and as a phone notification when an item is time-sensitive.
