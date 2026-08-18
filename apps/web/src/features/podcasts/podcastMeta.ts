/**
 * The podcast detail header's composed meta line — `docs/design/screens/PODCAST_DETAIL.md`
 * §5's joining rule: `"{n} {episode|episodes} · {u} unplayed"`, e.g. `"128 episodes · 3
 * unplayed"`, `"1 episode · 0 unplayed"`. A small pure function, tested directly, mirroring
 * `itemMeta.ts`'s `composeItemMeta` for the book screen — kept in its own file rather than
 * added to that one, since it composes different fields for a different screen (§5: "a new
 * file in `features/podcasts/`, not a modification to the book-only `itemMeta.ts`").
 */

/**
 * Omits the whole line (`null`, no `·` artifact) when the podcast has zero episodes — there
 * is nothing to count. Once there is at least one episode, the unplayed count is **always**
 * shown, including `0` — a real "you're caught up" state, not an absent field (§5, the same
 * reasoning `BOOK_DETAIL.md` §5 applies to `progressPercent`).
 */
export function composePodcastMeta(episodeCount: number, unplayedCount: number): string | null {
  if (episodeCount === 0) return null;
  const episodeWord = episodeCount === 1 ? 'episode' : 'episodes';
  return `${episodeCount} ${episodeWord} · ${unplayedCount} unplayed`;
}
