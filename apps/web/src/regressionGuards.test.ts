/**
 * Repo-wide guards for defects that have already shipped once and are cheap to
 * reintroduce, because nothing in the type system stops them — see the "trap"
 * documented on `packages/abs-client/src/domain.ts`'s header comment.
 *
 * The series/author detail pages (docs/HANDOVER.md, "author and series detail
 * pages", 2026-08-07) both shipped broken the same way: a minified
 * Audiobookshelf item's `media.authors[]`/`media.series[]` is never actually
 * absent (Book.authors/Book.series are typed as plain arrays, not
 * `T[] | undefined`, unlike `tracks`/`chapters`) — it's always a single
 * fallback entry whose `id` is the *display name*, not a real entity id. Code
 * that compares that `id` against a real author/series id from a route param
 * can look completely reasonable and never once match. This is a real risk
 * because nothing forces a future page author to notice: the type checks out,
 * the array is non-empty, and it only fails at runtime against real (or
 * correctly-fixtured) data.
 *
 * This guard can't see through the type system the way a branded type would —
 * it's a text scan, not a type check — so treat it as a tripwire for the
 * *exact* shape of the bug that already happened twice (`findAuthorBooks`,
 * `SeriesPage`'s old `seriesId` lookup), not a general guarantee that no
 * variant of this mistake can ever land. Confirmed to actually catch the
 * original code: reverting `SeriesPage.tsx`'s fix locally and rerunning this
 * test turns it red (see the sibling doc note in `docs/HANDOVER.md`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)));

/** Files allowed to contain the pattern's literal text — because they *are*
 * the fallback machinery itself (normalizeMedia lives in `packages/abs-client`,
 * outside this scan's root, so nothing here needs an allowlist entry for it),
 * or because they only *describe* the bug in prose. Kept intentionally short:
 * an allowlist that grows freely stops being a guard. */
const ALLOWED_RELATIVE_PATHS = new Set<string>([
  // This test file's own doc comment above quotes the pattern's shape in prose.
  'regressionGuards.test.ts',
]);

/** Strips line comments and block comments so a doc comment that *mentions*
 * the pattern (to explain the historical bug, as several files here now do)
 * can't be mistaken for the pattern itself. Deliberately simple — no string-
 * literal awareness — which is fine: nothing in this codebase puts the
 * pattern being searched for inside a string literal. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * The exact shape both real bugs had: `media.authors`/`media.series` — the
 * `media.` prefix is deliberate and load-bearing, not decoration: it's what
 * distinguishes a per-book fallback array (the trap) from an unrelated
 * `series`/`authors` collection with real ids, such as `SeriesPage.tsx`'s own
 * (correct) `seriesQuery.data?.series.find((s) => s.id === seriesId)`, which
 * matches Audiobookshelf's top-level series list, not a book's minified
 * fallback. Dropping the `media.` prefix would flag that line as a false
 * positive — confirmed empirically while writing this guard, not assumed.
 * Optionally `?.`-guarded, `.find(`/`.some(`, and — within the same call — an
 * `.id ===` comparison. Bounded to 100 characters between the call and the
 * comparison so it can't accidentally span into unrelated code.
 */
const MINIFIED_ID_MATCH_PATTERN =
  /\.media\.(authors|series)\??\.(find|some)\([\s\S]{0,100}?\.id\s*===/;

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe('minified authors/series id-matching (regression guard)', () => {
  it("never compares a fallback authors/series entry's id against a real entity id", () => {
    const offenders: string[] = [];
    for (const file of listSourceFiles(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file);
      if (ALLOWED_RELATIVE_PATHS.has(rel)) continue;
      const code = stripComments(readFileSync(file, 'utf-8'));
      if (MINIFIED_ID_MATCH_PATTERN.test(code)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
