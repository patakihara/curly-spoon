/**
 * Auralis — deterministic Android versionCode derivation for release tags.
 *
 * `PackageManager` (and F-Droid's own repo index) require a strictly increasing
 * integer `versionCode` on every release, and Android refuses to "downgrade" a
 * device to a lower one. `docs/research/FDROID_DISTRIBUTION.md` §6 proposed
 * counting release tags rather than deriving the number from semver directly,
 * because semver can't be trusted to sort monotonically pre-1.0 (a `0.9.0`
 * after a `0.10.0` would sort backwards numerically). This module is that
 * counting scheme, implemented as a pure function so it can be unit tested
 * without a real git checkout or a real Gradle invocation.
 *
 * `computeVersionCode` sorts every known release tag by semver (not by push
 * order, and not by string order) and returns the target tag's 1-based
 * position in that order. Sorting by semver rather than by "when it was
 * pushed" is deliberate: a hotfix tag such as `v0.3.1` pushed after `v0.4.0`
 * already exists must still land *before* `v0.4.0` in versionCode order, or
 * a device on `v0.4.0` would refuse the "older" hotfix as a downgrade.
 *
 * Never used directly by Gradle (there is no Kotlin git-tag-walking in this
 * repo) — CI computes the versionCode once, from the full tag list, and
 * passes it to `./gradlew` as `-PauralisVersionCode=<n>` and
 * `-PauralisVersionName=<version>`. See `apps/android/app/build.gradle.kts`.
 */

/** Parses `v1.2.3` or `v1.2.3-beta.1` into a comparable `[major, minor, patch]` triple.
 * A pre-release suffix is dropped for ordering purposes — this scheme orders release
 * *lines*, and a prerelease of `v0.4.0` still needs a versionCode below the eventual
 * `v0.4.0` release, matching semver's own precedence rule that a prerelease sorts before
 * its final release. Throws on anything that doesn't match `v<major>.<minor>.<patch>`,
 * the same shape `release.yml`'s `validate-version` job already enforces — a tag that
 * reached this function malformed is a bug upstream, not a case to degrade quietly for.
 */
export function parseTag(tag) {
  const match = /^v(\d+)\.(\d+)\.(\d+)(?:-.+)?$/.exec(tag);
  if (!match) {
    throw new Error(`Not a valid release tag: ${JSON.stringify(tag)}`);
  }
  const [, major, minor, patch] = match;
  return [Number(major), Number(minor), Number(patch)];
}

/** Compares two tags by semver precedence (major, then minor, then patch), a prerelease
 * of a version sorting immediately before that version's final release, and — only when
 * major/minor/patch and prerelease-ness are otherwise equal — falling back to a plain
 * string comparison so two different prerelease suffixes of the same base version (e.g.
 * `v0.4.0-beta.1` vs. `v0.4.0-beta.2`) still sort deterministically instead of tying.
 */
export function compareTags(a, b) {
  const [aMajor, aMinor, aPatch] = parseTag(a);
  const [bMajor, bMinor, bPatch] = parseTag(b);
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  if (aPatch !== bPatch) return aPatch - bPatch;
  const aIsPrerelease = a.includes('-');
  const bIsPrerelease = b.includes('-');
  if (aIsPrerelease !== bIsPrerelease) return aIsPrerelease ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Returns the 1-based position of `targetTag` within `allTags` sorted by semver
 * precedence — the versionCode for that release. `allTags` need not already contain
 * `targetTag`; a tag that has just been pushed but is not yet in the caller's `git tag`
 * listing is included automatically, so CI can call this the moment it observes the tag
 * push event without waiting for its own `git fetch --tags` to see it reflected back.
 *
 * Throws if `targetTag` itself is malformed (via `parseTag`), and silently ignores any
 * tag in `allTags` that is *not* a valid `v<major>.<minor>.<patch>` release tag — a repo
 * can have other tags (a CI experiment, a mistaken push) that must not perturb the count.
 */
export function computeVersionCode(allTags, targetTag) {
  const validTags = new Set(
    allTags.filter((tag) => {
      try {
        parseTag(tag);
        return true;
      } catch {
        return false;
      }
    })
  );
  validTags.add(targetTag); // ensures targetTag is present even if allTags predates it
  const sorted = [...validTags].sort(compareTags);
  const index = sorted.indexOf(targetTag);
  return index + 1;
}

/** Strips the leading `v` for Gradle's `versionName`, e.g. `v0.2.0` → `0.2.0`. */
export function versionNameFromTag(tag) {
  parseTag(tag); // validates shape; throws the same way computeVersionCode's callers expect
  return tag.slice(1);
}
