/**
 * The staging container follows `:latest`, which only a release writes (release.yml), and
 * mediaserver redeploys it. The newest release is GitHub's latest release: never a draft or a
 * prerelease, matching release.yml, which moves `:latest` only for a release that is neither.
 */

/** How long staging has, after a release is published, to report its commit. */
export const STAGING_GRACE_MS = 30 * 60 * 1000;

/**
 * GitHub's `GET /releases/latest` answer, as `{ tag, at }` with `at` the time it was published.
 * Throws on an answer that is not a published, final release.
 * @param {unknown} answer
 */
export function newestRelease(answer) {
  const release = /** @type {Record<string, unknown>} */ (answer ?? {});
  if (typeof release.tag_name !== 'string' || release.tag_name === '') {
    throw new Error('the latest release has no tag_name');
  }
  if (release.draft !== false) throw new Error(`${release.tag_name} is a draft`);
  if (release.prerelease !== false) throw new Error(`${release.tag_name} is a prerelease`);
  const at = typeof release.published_at === 'string' ? Date.parse(release.published_at) : NaN;
  if (Number.isNaN(at)) throw new Error(`${release.tag_name} has no published_at`);
  return { tag: release.tag_name, at };
}

/**
 * Whether staging has had its grace period since the release was published.
 * @param {{ at: number }} release
 * @param {number} now
 */
export const isDue = (release, now) => now - release.at >= STAGING_GRACE_MS;
