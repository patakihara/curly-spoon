---
id: enforce
nav: Staying on track
part: How it's built
---
## Staying on track, enforced

::: lede
The old project drifted: code built outside the design, pages nobody refreshed, a roadmap and handover that grew until they stopped describing reality. Each rule here is a check that fails, not a habit to remember.
:::

### Build through the design

- **Generated code can't be edited by hand.** The web UI package, Android's component props, the routes and the page layouts are all generated from `design/`. CI regenerates them and fails on any difference, and a Claude Code hook in the repo refuses edits to those folders, so the only way to change UI is through the design.
- **No component without a design.** CI fails if app code uses a component that doesn't exist in Sonora with its `.d.ts`, card and previews. Lint rejects styled elements, raw colours and one-off components outside the UI package.
- **No screen without a page.** The app's routes must equal the canvas's `nav.json`, and every page must match its generated layout. Adding a screen in code alone fails the build.
- **Looks match.** Each page's screenshot, on both platforms, is compared against the canvas's render of the same page.

### Keep the artifacts current

- **Every artifact says what it was built from.** Its footer shows the repo commit, and `design/published.json` records the commit and artifact version of each publish.
- **Unpublished design changes block the merge.** CI fails if `design/` changed after the recorded publish. Publishing needs a Claude session, so a hook in the repo also stops a Claude session from finishing while a design change is unpublished.
- **Your side is read first.** Before touching `design/`, the session compares the live artifact with the recorded version. If you've edited it or left comments since, those are pulled in or answered first. Open comments are listed at the start of every session.

### Keep the plan clean and the progress true

The plan and the progress are two different things, kept apart on purpose. The plan is written by hand and says what is being built and why. The progress is never written by hand; it's worked out from the repo.

::: grid g2
::: card
#### The plan: edited in place

- Lives in the repo (`docs/plan/`) and is published to this artifact, with the same commit stamp and merge check as the design.
- Only ever describes the current decision. No dated update notes, no "a previous version said". Why something changed is in git history, not in the text.
- Asking for an adjustment means that sentence gets rewritten where it stands. It's the only place decisions live, so nothing else needs chasing.
- Every item has an id and a concrete **done when**, and a size limit keeps the whole thing readable.
:::

::: card
#### The progress: computed, never written

- **Done**: each item's check (a test, a recording, a route that exists) is tagged with its id; done means it passes. Items that are done only when you say so ("you used it for a week") get your sign-off as a git tag.
- **In progress**: unfinished work lives on a branch, and its "where I stopped, what's next" note is the branch's description. It disappears when the branch merges, so nothing piles up.
- **Next**: the first unfinished item of the current milestone.
- No progress file exists, so none can grow or go stale.
:::
:::

- **A new session knows where things stand.** A session-start hook in the repo prints a short summary: current milestone, done items, work in flight with its notes, the next step, failing checks, and your open comments on the artifacts.
- **You see it too.** When the plan is published, each item gets a done or in-progress badge worked out at that moment, so progress shows on the page without the text changing.
- **Every commit names its plan item** (a `Plan:` line). CI rejects app changes without one. Work that isn't in the plan gets added to it first, in the same commit, so the code can't run ahead of the plan.
- **Checked with you at every milestone.** The demo ends with the plan read through together; anything that changed is rewritten in place, and the milestone gets your sign-off tag.

### No scars

- **Replacing something deletes the old thing in the same change, everywhere it lives:** code, config, containers, timers, settings, secrets, data folders, docs, map entries, memory notes, scripts on either host. No legacy folders, compatibility shims, commented-out code, "formerly" notes or backups. Git history is the only record.
- **The old Auralis goes completely.** Its code leaves `main` (kept only at the `legacy` tag), and its leftovers on mediaserver and the ThinkPad are deleted once nothing uses them: the old container setup and data folder, the update timer, the old autorun machinery, old docs and map entries.
- **Checked before a milestone counts as done:** a sweep for references to removed things, unused files and settings, and orphaned containers or timers, on top of the dead-code lint.

### Your ideas, without derailing

Anything you say about Auralis, in any session, in a comment on an artifact, or directly to the running development session, goes through one fixed path. Each step is safe to interrupt: nothing is lost if a session dies halfway.

1. **Filed.** One file per idea in `docs/inbox/`: your words verbatim, where it came from (chat, a comment thread, a direct message), and the date. The session replies `Noted: <title>` (in the thread, for a comment) and carries on. Filing never touches the plan or the work in progress. The only exceptions: you say "do it now", you're answering one of its outbox items, or you're telling the session itself to stop or pause.
2. **Sorted, at set moments:** each milestone demo, when you say "let's go through my ideas", or once about ten are waiting. The orchestrator hands sorting to a subagent in a fresh context, one idea at a time: it reads the idea and the whole plan, and decides which of these it is:  It also lists what else in the plan the change affects, and those edits go in too.
   - **new work**: a new plan item, with an id and a concrete "done when", in the milestone where it belongs (usually a later one; the milestone in progress only takes small fixes to what it builds, or anything you pulled in);
   - **a change** to an existing item: that item is rewritten in place, including its "done when";
   - **a bug** in something done: a check that catches it is added to that item, which reopens it;
   - **already planned**: the existing sentence is sharpened if your words add something;
   - **a call only you can make**: an outbox item with its default, and the idea waits for your answer;
   - **a drop**: only with your OK, asked through the outbox.
3. **Applied in one commit**: the plan edit, the inbox file's deletion, and a commit message naming the plan item and the inbox file. Until that commit lands the idea stays in the inbox, so a crash never loses one. The plan checks run on that commit: unique ids, every item has a "done when", the size limit, no dated notes.
4. **Progress follows by itself.** Nothing is written by hand: a new item shows as planned, a changed item whose check no longer passes shows as not done, and a bug's new check reopens its item. It all appears in the next session-start summary.
5. **Closed the loop with you.** The plan page is republished, a comment thread gets a reply saying where the idea landed and is resolved, and the plan page and the session-start summary list recently sorted ideas and where each went.

### What needs you, without waiting on you

**Almost everything is decided by the session doing the work.** The outbox (`docs/outbox/`) holds only what genuinely needs you, and nothing ever waits on it.

- **Five kinds only:** a product call that passes your test ("would she have an opinion, and does the answer change what she gets?"); a name; anything published or shared beyond the machines; anything destructive or irreversible; something only you can physically do (try a milestone build, sign off, export YouTube cookies, test in the car).
- **Every item carries its default**, and work goes ahead on it: a working name gets used until you rename it, a product call gets the session's best choice, which you can overturn later. Only irreversible or outward-facing actions hold until you answer, and the rest of the work continues around them.
- **Kept small by checks.** An item without its kind and default is rejected. More than about five open items means sessions are over-asking, and the session-start summary says so. Answered items are deleted.
- **Decisions made for you are visible, not queued.** They're written into the plan in place, and their commits carry a `Decision:` line. The session-start summary and this page list the recent ones for you to skim; overruling one is just saying so.
- **Where you see it:** a "waiting on you" box at the top of this page, in every session's opening summary, and as a phone notification when an item is time-sensitive.
