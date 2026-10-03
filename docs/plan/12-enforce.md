---
id: enforce
nav: Staying on track
part: How it's built
---
## Staying on track, enforced

::: lede
The old project drifted from its design and its docs. Each rule here is a check that fails, not a habit to remember.
:::

### Build through the design

- **Generated code can't be edited by hand.** The web UI package, Android's component props, the routes and the page layouts are generated from `design/`. CI fails on any difference from a regeneration, and a repo hook refuses edits there, so UI changes only through the design.
- **No component without a design.** CI fails if app code uses a component that doesn't exist in Sonora with its `.d.ts`, card and previews. Lint rejects styled elements, raw colours and one-off components outside the UI package, and a check refuses raw sizes, colours, timings and layers inside Sonora and Android's `ui/sonora`.
- **No screen without a page, and looks match.** Routes, layouts and both platforms' screenshots are checked against the canvas, as "From design to both apps" lists.

### Keep the artifacts current

- **Every artifact says what it was built from.** Its footer shows the repo commit, and `design/published.json` records the commit and artifact version of each publish.
- **Unpublished design changes block the merge.** CI fails if `design/` changed after the recorded publish. A repo hook stops a session finishing with a design change unpublished.
- **Your side is read first.** Before touching `design/`, the session compares the live artifact with the recorded version, and your edits or comments since come first. Every session starts by listing open comments.

### Keep the plan clean and the progress true

::: grid g2
::: card
#### The plan: edited in place

- Lives in the repo (`docs/plan/`) and is published to this artifact, with the same commit stamp and merge check as the design.
- Only describes the current decision: no dated notes or "a previous version said"; why it changed is in git history.
- An adjustment rewrites that sentence where it stands; decisions live nowhere else.
- Every item has an id and a concrete **done when**, and a size limit keeps the whole thing readable.
:::

::: card
#### The progress: computed, never written

- **Done**: each item's check (a test, a recording, a route that exists) is tagged with its id; done means it passes. Items that are done only when you say so ("you used it for a week") get your sign-off as a git tag.
- **In progress**: unfinished work lives on a branch whose description is its "where I stopped, what's next" note. It disappears when the branch merges, so nothing piles up.
- **Next**: the first unfinished item of the current milestone.
- No progress file exists to go stale.
:::
:::

- **"What this plan hasn't verified" stays current.** Each line names the existing item whose work checks it. The session-start summary flags a line whose item is done, and the orchestrator drops it or cuts it to what's still open. A gap a subagent reports but can't check is added, naming the item that will.
- **A new session knows where things stand.** A session-start hook prints the current milestone, done items, work in flight with its notes, the next step, failing checks and your open artifact comments.
- **You see it too.** The published plan shows each item's done or in-progress badge, computed at publish, without the text changing.
- **Every commit names its plan item** (a `Plan:` line); CI rejects app changes without one. Work not in the plan is added to it first, in the same commit.
- **Checked with you at every milestone.** The demo ends with the plan read through together; anything that changed is rewritten in place, and the milestone gets your sign-off tag.

### No scars

- **Replacing something deletes the old thing in the same change, everywhere it lives:** code, config, containers, timers, settings, secrets, data folders, docs, map entries, memory notes, scripts on either host. No legacy folders, compatibility shims, commented-out code, "formerly" notes or backups. Git history is the only record.
- **The old Auralis goes completely.** Its code leaves `main` (kept at the `legacy` tag), and its leftovers on mediaserver and the laptop go once nothing uses them: the old container setup and data folder, the update timer, the old autorun machinery, old docs and map entries.
- **Checked before a milestone counts as done:** a sweep for references to removed things, unused files and settings, and orphaned containers or timers, on top of the dead-code lint.

### Your ideas, without derailing

Anything you say about Auralis, in any session or artifact comment, takes one fixed path, each step safe to interrupt.

1. **Filed.** One file per idea in `docs/inbox/`: your words verbatim, where it came from (chat, a comment thread, a direct message), and the date. The session replies `Noted: <title>` (in the thread, for a comment) and carries on. Filing never touches the plan or the work in progress, unless you say "do it now", answer one of its outbox items, or tell the session itself to stop or pause.
2. **Sorted, at set moments:** each milestone demo, when you say "let's go through my ideas", or once about ten are waiting. The orchestrator hands each idea, one at a time, to a fresh-context subagent that reads it and the whole plan and decides which it is:
   - **new work**: a new plan item, with an id and a concrete "done when", in the milestone where it belongs (usually a later one; the milestone in progress only takes small fixes to what it builds, or anything you pulled in);
   - **a change** to an existing item: that item is rewritten in place, including its "done when";
   - **a bug** in something done: a check that catches it is added to that item, which reopens it;
   - **already planned**: the existing sentence is sharpened if your words add something;
   - **a call only you can make**: an outbox item with its default, and the idea waits for your answer;
   - **a drop**: only with your OK, asked through the outbox.

   It also edits whatever else in the plan the change affects.
3. **Applied in one commit**: the plan edit, the inbox file's deletion, and a commit message naming the plan item and the inbox file. Until that commit lands the idea stays in the inbox, so a crash never loses one. The plan checks run on that commit.
4. **Progress follows by itself.** Nothing is written by hand: in the next session-start summary, a new item shows as planned, a changed item whose check no longer passes as not done, and a bug's new check reopens its item.
5. **Closed the loop with you.** The plan page is republished, a comment thread gets a reply saying where the idea landed and is resolved, and the page and the session-start summary list recently sorted ideas and where each went.

### What needs you, without waiting on you

**The session doing the work decides almost everything.** The outbox (`docs/outbox/`) holds only what genuinely needs you.

- **Five kinds only:** a product call that passes your test ("would she have an opinion, and does the answer change what she gets?"); a name; anything published or shared beyond the machines; anything destructive or irreversible; something only you can physically do (try a milestone build, sign off, export YouTube cookies, test in the car).
- **Every item carries its default**, and work goes ahead on it: a working name gets used until you rename it, a product call gets the session's best choice, yours to overturn. Only irreversible or outward-facing actions wait for your answer; other work continues around them.
- **Kept small by checks.** An item without its kind and default is rejected. Over about five open items means sessions over-ask, and the session-start summary says so. Answered items are deleted.
- **Decisions made for you are visible, not queued.** They're written into the plan in place, and their commits carry a `Decision:` line. The session-start summary and this page list the recent ones for you to skim; overruling one is just saying so.
- **Where you see it:** a "waiting on you" box at the top of this page, in every session's opening summary, and as a phone notification when an item is time-sensitive.
