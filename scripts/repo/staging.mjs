/**
 * The staging container follows `main`: each green build of `main` is published to `:latest`,
 * and mediaserver redeploys it. These read GitHub's Publish runs to find the publish the
 * container must have caught up with by now. Publish names each run after the commit it built.
 */

/** How long staging has, after a publish finishes, to report that commit. */
export const STAGING_GRACE_MS = 30 * 60 * 1000;

const NAMED = /^Publish ([0-9a-f]{40})$/;

/**
 * The publishes among GitHub's workflow runs: each successful run named after a commit, as
 * `{ commit, at }` with `at` the time the run finished.
 * @param {Array<{ display_title: string, conclusion: string | null, updated_at: string }>} runs
 */
export function publishes(runs) {
  return runs.flatMap((run) => {
    const named = NAMED.exec(run.display_title);
    if (run.conclusion !== 'success' || named === null) return [];
    return [{ commit: named[1], at: Date.parse(run.updated_at) }];
  });
}

/**
 * The newest publish that finished at least the grace period before `now`, or null.
 * @param {Array<{ commit: string, at: number }>} list
 * @param {number} now
 */
export function duePublish(list, now) {
  const due = list.filter((p) => now - p.at >= STAGING_GRACE_MS).sort((a, b) => b.at - a.at);
  return due[0] ?? null;
}
